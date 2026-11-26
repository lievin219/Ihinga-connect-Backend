import { HttpError } from "../auth/errors.js";

const CROP_NAME_MAX_LENGTH = 100;
const UNIT_MAX_LENGTH = 32;
const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const PRICE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "A JSON object is required.");
  }

  return value;
}

function requireName(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string.`);
  }

  const result = value.trim();
  if (result.length < 1 || result.length > maxLength) {
    throw new HttpError(400, `${field} must be between 1 and ${maxLength} characters.`);
  }

  return result;
}

function requireDecimal(value, field, pattern, { allowNull = false } = {}) {
  if (allowNull && value === null) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpError(400, `${field} must be a positive decimal number.`);
  }

  const decimal = String(value);
  if (!pattern.test(decimal) || Number(decimal) <= 0) {
    throw new HttpError(400, `${field} must be a positive decimal number with supported precision.`);
  }

  return decimal;
}

export function validateCropId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, "cropId must be a valid UUID.");
  }

  return value;
}

export function validateCropCreate(value) {
  const body = requireObject(value);

  return {
    cropName: requireName(body.cropName, "cropName", CROP_NAME_MAX_LENGTH),
    quantityAvailable: requireDecimal(body.quantityAvailable, "quantityAvailable", QUANTITY_PATTERN),
    unit: requireName(body.unit, "unit", UNIT_MAX_LENGTH),
    pricePerUnitRwf: body.pricePerUnitRwf === undefined
      ? null
      : requireDecimal(body.pricePerUnitRwf, "pricePerUnitRwf", PRICE_PATTERN, { allowNull: true }),
  };
}

export function validateCropUpdate(value) {
  const body = requireObject(value);
  const fields = ["cropName", "quantityAvailable", "unit", "pricePerUnitRwf", "isAvailable"];
  const unknownFields = Object.keys(body).filter((key) => !fields.includes(key));
  if (unknownFields.length > 0) {
    throw new HttpError(400, `Unsupported crop listing field: ${unknownFields[0]}.`);
  }

  const updates = {};
  if (Object.hasOwn(body, "cropName")) {
    updates.cropName = requireName(body.cropName, "cropName", CROP_NAME_MAX_LENGTH);
  }
  if (Object.hasOwn(body, "quantityAvailable")) {
    updates.quantityAvailable = requireDecimal(body.quantityAvailable, "quantityAvailable", QUANTITY_PATTERN);
  }
  if (Object.hasOwn(body, "unit")) {
    updates.unit = requireName(body.unit, "unit", UNIT_MAX_LENGTH);
  }
  if (Object.hasOwn(body, "pricePerUnitRwf")) {
    updates.pricePerUnitRwf = requireDecimal(
      body.pricePerUnitRwf,
      "pricePerUnitRwf",
      PRICE_PATTERN,
      { allowNull: true },
    );
  }
  if (Object.hasOwn(body, "isAvailable")) {
    if (typeof body.isAvailable !== "boolean") {
      throw new HttpError(400, "isAvailable must be a boolean.");
    }

    updates.isAvailable = body.isAvailable;
  }
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "At least one supported crop listing field is required.");
  }

  return updates;
}

export function validateCropListQuery(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, "limit must be an integer between 1 and 100.");
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000_000) {
    throw new HttpError(400, "offset must be a non-negative integer.");
  }

  let search = "";
  if (query.search !== undefined) {
    if (typeof query.search !== "string" || query.search.trim().length > 100) {
      throw new HttpError(400, "search must be a string of at most 100 characters.");
    }

    search = query.search.trim();
  }

  let district = "";
  if (query.district !== undefined) {
    district = requireName(query.district, "district", 120);
  }

  return { limit, offset, search, district };
}
