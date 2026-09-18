const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Address = require('../models/Address');
const { serializeAddress } = Address;

const LABELS = ['Home', 'Office', 'Other'];

function pickAddressBody(body) {
  const data = {};
  if (body.label != null) {
    if (!LABELS.includes(body.label)) {
      throw new ApiError(400, `label must be one of: ${LABELS.join(', ')}`);
    }
    data.label = body.label;
  }
  for (const key of ['fullName', 'phone', 'street', 'city', 'state', 'zip', 'country']) {
    if (body[key] != null) data[key] = String(body[key]).trim();
  }
  if (body.isDefault != null) data.isDefault = Boolean(body.isDefault);
  return data;
}

function assertRequired(data, creating) {
  const required = ['fullName', 'phone', 'street', 'city', 'zip'];
  for (const key of required) {
    if (creating && !data[key]) {
      throw new ApiError(400, `${key} is required`);
    }
  }
}

/**
 * GET /addresses
 */
const listAddresses = asyncHandler(async (req, res) => {
  const docs = await Address.find({ user: req.user._id }).sort({
    isDefault: -1,
    createdAt: -1,
  });
  const addresses = docs.map(serializeAddress);
  const defaultId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
  res.json(
    new ApiResponse(200, {
      addresses,
      selectedAddressId: defaultId,
      selectedAddress: addresses.find((a) => a.id === defaultId) || null,
    }),
  );
});

/**
 * POST /addresses — matches addAddress
 */
const createAddress = asyncHandler(async (req, res) => {
  const data = pickAddressBody(req.body);
  assertRequired(data, true);
  data.label = data.label || 'Home';
  data.country = data.country || 'India';

  const count = await Address.countDocuments({ user: req.user._id });
  if (data.isDefault || count === 0) {
    await Address.updateMany({ user: req.user._id }, { isDefault: false });
    data.isDefault = true;
  }

  const address = await Address.create({ ...data, user: req.user._id });
  res.status(201).json(
    new ApiResponse(201, { address: serializeAddress(address) }, 'Address added'),
  );
});

/**
 * PATCH /addresses/:id — matches updateAddress
 */
const updateAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) throw new ApiError(404, 'Address not found');

  const data = pickAddressBody(req.body);
  if (data.isDefault) {
    await Address.updateMany({ user: req.user._id }, { isDefault: false });
  }

  Object.assign(address, data);
  await address.save();

  res.json(new ApiResponse(200, { address: serializeAddress(address) }, 'Address updated'));
});

/**
 * POST /addresses/:id/default — matches setDefault
 */
const setDefault = asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) throw new ApiError(404, 'Address not found');

  await Address.updateMany({ user: req.user._id }, { isDefault: false });
  address.isDefault = true;
  await address.save();

  const docs = await Address.find({ user: req.user._id }).sort({
    isDefault: -1,
    createdAt: -1,
  });
  res.json(
    new ApiResponse(
      200,
      { addresses: docs.map(serializeAddress), address: serializeAddress(address) },
      'Default address updated',
    ),
  );
});

/**
 * DELETE /addresses/:id — matches removeAddress
 */
const deleteAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!address) throw new ApiError(404, 'Address not found');

  if (address.isDefault) {
    const next = await Address.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  res.json(new ApiResponse(200, null, 'Address deleted'));
});

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefault,
  deleteAddress,
};
