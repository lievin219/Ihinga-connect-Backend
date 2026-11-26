import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/auth/errors.js";
import {
  validateCropCreate,
  validateCropId,
  validateCropListQuery,
  validateCropUpdate,
} from "../src/crops/validation.js";

test("validates crop listing details and optional RWF price", () => {
  assert.deepEqual(validateCropCreate({
    cropName: "  Irish potatoes ",
    quantityAvailable: 125.5,
    unit: "kg",
  }), {
    cropName: "Irish potatoes",
    quantityAvailable: "125.5",
    unit: "kg",
    pricePerUnitRwf: null,
  });

  assert.deepEqual(validateCropCreate({
    cropName: "Beans",
    quantityAvailable: "20.250",
    unit: "bag",
    pricePerUnitRwf: "1500.50",
  }), {
    cropName: "Beans",
    quantityAvailable: "20.250",
    unit: "bag",
    pricePerUnitRwf: "1500.50",
  });
});

test("rejects invalid quantities, units, and asking prices", () => {
  assert.throws(() => validateCropCreate({
    cropName: "Maize",
    quantityAvailable: 0,
    unit: "kg",
  }), HttpError);
  assert.throws(() => validateCropCreate({
    cropName: "Maize",
    quantityAvailable: 5,
    unit: "kg",
    pricePerUnitRwf: -10,
  }), HttpError);
  assert.throws(() => validateCropCreate({
    cropName: "Maize",
    quantityAvailable: 5.1234,
    unit: "kg",
  }), HttpError);
});

test("validates partial listing updates and UUIDs", () => {
  assert.deepEqual(validateCropUpdate({
    pricePerUnitRwf: null,
    isAvailable: false,
  }), {
    pricePerUnitRwf: null,
    isAvailable: false,
  });
  assert.throws(() => validateCropUpdate({ farmerId: "another-user" }), HttpError);
  assert.throws(() => validateCropUpdate({}), HttpError);
  assert.equal(validateCropId("8f30b602-59c4-48e1-a07b-c0758b585cd8"), "8f30b602-59c4-48e1-a07b-c0758b585cd8");
  assert.throws(() => validateCropId("not-a-uuid"), HttpError);
});

test("validates public listing filters and pagination", () => {
  assert.deepEqual(validateCropListQuery({
    search: " beans ",
    district: "Kigali",
    limit: "10",
    offset: "20",
  }), {
    search: "beans",
    district: "Kigali",
    limit: 10,
    offset: 20,
  });
  assert.throws(() => validateCropListQuery({ limit: "101" }), HttpError);
});
