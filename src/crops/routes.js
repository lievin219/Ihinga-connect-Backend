import { randomUUID } from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";
import { asyncRoute } from "../http.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { HttpError } from "../auth/errors.js";
import {
  validateCropCreate,
  validateCropId,
  validateCropListQuery,
  validateCropUpdate,
} from "./validation.js";

const router = Router();

function cropListing(row) {
  return {
    id: row.id,
    cropName: row.crop_name,
    quantityAvailable: row.quantity_available,
    unit: row.unit,
    pricePerUnitRwf: row.price_per_unit_rwf,
    isAvailable: row.is_available,
    farmer: {
      fullName: row.farmer_name,
      district: row.farmer_district,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const publicListingColumns = `
  c.id, c.crop_name, c.quantity_available, c.unit, c.price_per_unit_rwf,
  c.is_available, c.created_at, c.updated_at,
  u.full_name AS farmer_name, u.district AS farmer_district
`;

const publicListingJoins = `
  JOIN users u ON u.id = c.farmer_id AND u.is_active = TRUE
`;

router.get("/", asyncRoute(async (request, response) => {
  const { limit, offset, search, district } = validateCropListQuery(request.query);
  const conditions = ["c.is_available = TRUE"];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`c.crop_name ILIKE $${values.length}`);
  }
  if (district) {
    values.push(district);
    conditions.push(`u.district ILIKE $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");
  values.push(limit, offset);
  const result = await pool.query(
    `SELECT ${publicListingColumns}
     FROM crop_listings c
     ${publicListingJoins}
     WHERE ${whereClause}
     ORDER BY c.created_at DESC, c.id
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  response.json({
    items: result.rows.map(cropListing),
    pagination: { limit, offset },
  });
}));

router.get("/mine", authenticate, requireRole("farmer"), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT ${publicListingColumns}
     FROM crop_listings c
     ${publicListingJoins}
     WHERE c.farmer_id = $1
     ORDER BY c.created_at DESC, c.id`,
    [request.authUser.id],
  );

  response.json({ items: result.rows.map(cropListing) });
}));

router.post("/", authenticate, requireRole("farmer"), asyncRoute(async (request, response) => {
  const crop = validateCropCreate(request.body);
  const result = await pool.query(
    `INSERT INTO crop_listings (id, farmer_id, crop_name, quantity_available, unit, price_per_unit_rwf)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, crop_name, quantity_available, unit, price_per_unit_rwf, is_available, created_at, updated_at`,
    [
      randomUUID(),
      request.authUser.id,
      crop.cropName,
      crop.quantityAvailable,
      crop.unit,
      crop.pricePerUnitRwf,
    ],
  );

  const listing = await pool.query(
    `SELECT ${publicListingColumns}
     FROM crop_listings c
     ${publicListingJoins}
     WHERE c.id = $1`,
    [result.rows[0].id],
  );

  response.status(201).json({ listing: cropListing(listing.rows[0]) });
}));

router.get("/:cropId/contact", authenticate, asyncRoute(async (request, response) => {
  const cropId = validateCropId(request.params.cropId);
  const result = await pool.query(
    `SELECT u.full_name, u.phone, u.district
     FROM crop_listings c
     JOIN users u ON u.id = c.farmer_id AND u.is_active = TRUE
     WHERE c.id = $1 AND c.is_available = TRUE`,
    [cropId],
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Available crop listing not found.");
  }

  response.json({
    contact: {
      fullName: result.rows[0].full_name,
      phone: result.rows[0].phone,
      district: result.rows[0].district,
    },
  });
}));

router.get("/:cropId", asyncRoute(async (request, response) => {
  const cropId = validateCropId(request.params.cropId);
  const result = await pool.query(
    `SELECT ${publicListingColumns}
     FROM crop_listings c
     ${publicListingJoins}
     WHERE c.id = $1 AND c.is_available = TRUE`,
    [cropId],
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Available crop listing not found.");
  }

  response.json({ listing: cropListing(result.rows[0]) });
}));

router.patch("/:cropId", authenticate, requireRole("farmer"), asyncRoute(async (request, response) => {
  const cropId = validateCropId(request.params.cropId);
  const updates = validateCropUpdate(request.body);
  const columns = {
    cropName: "crop_name",
    quantityAvailable: "quantity_available",
    unit: "unit",
    pricePerUnitRwf: "price_per_unit_rwf",
    isAvailable: "is_available",
  };
  const values = [];
  const assignments = Object.entries(updates).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });

  values.push(cropId, request.authUser.id);
  const result = await pool.query(
    `UPDATE crop_listings
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND farmer_id = $${values.length}
     RETURNING id`,
    values,
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Crop listing not found.");
  }

  const listing = await pool.query(
    `SELECT ${publicListingColumns}
     FROM crop_listings c
     ${publicListingJoins}
     WHERE c.id = $1`,
    [cropId],
  );

  response.json({ listing: cropListing(listing.rows[0]) });
}));

router.delete("/:cropId", authenticate, requireRole("farmer"), asyncRoute(async (request, response) => {
  const cropId = validateCropId(request.params.cropId);
  const result = await pool.query(
    "DELETE FROM crop_listings WHERE id = $1 AND farmer_id = $2",
    [cropId, request.authUser.id],
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Crop listing not found.");
  }

  response.status(204).end();
}));

export default router;
