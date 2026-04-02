import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

// ─── Validation env ───────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Variables d'environnement manquantes.\n" +
    "Requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n" +
    "Copie .env.example vers .env et remplis les valeurs."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Constantes ───────────────────────────────────────────────────────────────

const PARQUET_PATH   = resolve(__dirname, "bruxelles_places.parquet");
const BATCH_SIZE     = 100;
const MIN_CONFIDENCE = 0.5;

// ─── Mots-clés food ───────────────────────────────────────────────────────────

const FOOD_KEYWORDS = [
  "restaurant", "cafe", "coffee_shop", "coffee", "bakery", "pastry_shop", "patisserie",
  "fast_food_restaurant", "fast_food", "food", "pizza_restaurant", "pizza",
  "sushi_restaurant", "ramen_restaurant", "noodle_restaurant", "noodle",
  "burger_restaurant", "burger", "ice_cream_shop", "ice_cream", "gelato",
  "dessert_shop", "dessert", "donut_shop", "sandwich_shop", "sandwich",
  "deli", "delicatessen", "grill", "steakhouse", "steak_house",
  "bistro", "brasserie", "creperie", "wok",
  "juice_bar", "smoothie", "tea_house", "bubble_tea",
  "kebab", "falafel", "taco", "burrito", "poke_bowl", "poke",
  "seafood_restaurant", "seafood", "fish_and_chips", "oyster",
  "dim_sum", "dumpling", "curry", "tandoori",
  "brunch_restaurant", "brunch", "breakfast_restaurant", "breakfast",
  "buffet_restaurant", "buffet", "food_court",
  "confectionery", "chocolate_shop", "chocolate",
  "tapas", "tapas_bar", "tapas_restaurant",
  "wine_bar", "gastropub",
  "french_restaurant", "italian_restaurant", "japanese_restaurant",
  "chinese_restaurant", "american_restaurant", "mexican_restaurant",
  "indian_restaurant", "thai_restaurant", "mediterranean_restaurant",
  "greek_restaurant", "turkish_restaurant", "lebanese_restaurant",
  "middle_eastern_restaurant", "korean_restaurant", "vietnamese_restaurant",
  "african_restaurant", "moroccan_restaurant", "ethiopian_restaurant",
  "peruvian_restaurant", "brazilian_restaurant", "argentinian_restaurant",
  "spanish_restaurant", "portuguese_restaurant", "german_restaurant",
  "belgian_restaurant", "dutch_restaurant", "british_restaurant",
  "asian_restaurant", "east_asian_restaurant", "south_asian_restaurant",
  "southeast_asian_restaurant", "caribbean_restaurant", "latin_american_restaurant",
  "vegetarian_restaurant", "vegan_restaurant",
  "food_truck", "food_stand", "food_stall",
  "meal_delivery", "meal_takeaway",
];

const FOOD_REGEX = new RegExp(FOOD_KEYWORDS.join("|"), "i");

function isFoodCategory(cat) {
  if (!cat) return false;
  return FOOD_REGEX.test(cat);
}

function hasFoodCategory(primaryCat, alternateCats) {
  if (isFoodCategory(primaryCat)) return true;
  if (Array.isArray(alternateCats)) return alternateCats.some(isFoodCategory);
  return false;
}

// ─── Mapping catégorie Overture → restaurant_category ────────────────────────

function resolveCategory(primaryCat, alternateCats) {
  const candidates = [primaryCat, ...(Array.isArray(alternateCats) ? alternateCats : [])]
    .filter(Boolean)
    .map((c) => c.toLowerCase());

  const has = (kw) => candidates.some((c) => c.includes(kw));

  if (has("french"))                                        return "french";
  if (has("italian") || has("pizza"))                      return "italian";
  if (has("japanese") || has("sushi") || has("ramen"))     return "japanese";
  if (has("chinese"))                                       return "chinese";
  if (candidates.some((c) => c.includes("american") && !c.includes("latin_american")))
                                                            return "american";
  if (has("mexican") || has("taco") || has("burrito"))     return "mexican";
  if (has("indian") || has("tandoori") || has("curry") || has("south_asian"))
                                                            return "indian";
  if (has("thai"))                                          return "thai";
  if (has("mediterranean") || has("greek") || has("turkish") ||
      has("lebanese") || has("middle_eastern") || has("moroccan"))
                                                            return "mediterranean";
  if (has("fast_food") || has("kebab") || has("sandwich") ||
      has("food_truck") || has("food_stand"))               return "fast_food";
  if (has("cafe") || has("coffee") || has("tea_house") ||
      has("bubble_tea") || has("juice") || has("smoothie")) return "cafe";
  if (has("bakery") || has("pastry") || has("patisserie") || has("donut") ||
      has("bagel") || has("confectionery") || has("chocolate"))
                                                            return "bakery";
  if (has("seafood") || has("fish") || has("oyster"))       return "seafood";
  if (has("vegetarian") || has("vegan"))                    return "vegetarian";
  return "other";
}

// ─── Score de qualité (déduplication) ────────────────────────────────────────

function dataScore(r) {
  return [
    r.phone,
    r.website,
    r.address !== "Adresse non renseignée",
    r.postcode,
    r.city !== "Bruxelles",
  ].filter(Boolean).length;
}

// ─── DuckDB helpers (callbacks → Promises) ───────────────────────────────────

function dbExec(conn, sql) {
  return new Promise((res, rej) => {
    conn.exec(sql, (err) => (err ? rej(err) : res()));
  });
}

function dbAll(conn, sql) {
  return new Promise((res, rej) => {
    conn.all(sql, (err, rows) => (err ? rej(err) : res(rows ?? [])));
  });
}

// ─── Upsert Supabase ──────────────────────────────────────────────────────────

async function upsertBatch(batch) {
  const { error } = await supabase.rpc("batch_upsert_restaurants", {
    restaurants: batch,
  });
  if (error) throw new Error(error.message);
}

// ─── Helpers terminal ─────────────────────────────────────────────────────────

function bar(count, max, width = 22) {
  return "█".repeat(Math.round((count / (max || 1)) * width));
}

function barEmpty(count, max, width = 20) {
  const filled = Math.round((count / (max || 1)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ─── Résumé final ─────────────────────────────────────────────────────────────

function printFinalStats(restaurants, stats) {
  const total = restaurants.length;
  const SEP   = "═".repeat(62);

  const byCategory = {};
  for (const r of restaurants) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }
  const sortedCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat    = sortedCat[0]?.[1] ?? 1;

  const quality = [
    ["Adresse renseignée",  restaurants.filter((r) => r.address !== "Adresse non renseignée").length],
    ["Téléphone",           restaurants.filter((r) => r.phone).length],
    ["Site web",            restaurants.filter((r) => r.website).length],
    ["Code postal",         restaurants.filter((r) => r.postcode).length],
  ];
  const maxQ = Math.max(...quality.map((q) => q[1]), 1);

  console.log(`\n${SEP}`);
  console.log("  IMPORT OVERTURE MAPS (GEOPARQUET) TERMINÉ");
  console.log(SEP);
  console.log(`  Features Parquet totales         : ${String(stats.totalFeatures).padStart(7)}`);
  console.log(`  Filtrées (catégorie non-food)    : ${String(stats.rejectedCategory).padStart(7)}`);
  console.log(`  Filtrées (confidence < ${MIN_CONFIDENCE})      : ${String(stats.rejectedConfidence).padStart(7)}`);
  console.log(`  Ignorées (nom manquant)          : ${String(stats.rejectedName).padStart(7)}`);
  console.log(`  Ignorées (coords invalides)      : ${String(stats.rejectedCoords).padStart(7)}`);
  console.log(`  ────────────────────────────────────────────────────────────`);
  console.log(`  Restaurants upsertés             : ${String(total).padStart(7)}`);
  console.log(`  Erreurs batch Supabase           : ${String(stats.upsertErrors).padStart(7)}`);
  console.log(SEP);

  console.log("\n  Répartition par catégorie :");
  for (const [cat, count] of sortedCat) {
    const pct = Math.round((count / total) * 100);
    console.log(
      `    ${cat.padEnd(22)} ${String(count).padStart(6)}  (${String(pct).padStart(2)}%)  ${bar(count, maxCat)}`
    );
  }

  console.log(`\n${SEP}`);
  console.log("  Qualité des données :");
  for (const [label, count] of quality) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    console.log(
      `    ${label.padEnd(26)} ${String(count).padStart(6)}  (${String(pct).padStart(2)}%)  ${barEmpty(count, maxQ)}`
    );
  }

  if (Object.keys(stats.rejectedCategoryMap).length > 0) {
    const topRejected = Object.entries(stats.rejectedCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    const maxR = topRejected[0]?.[1] ?? 1;

    console.log(`\n${SEP}`);
    console.log("  Top 30 catégories Overture rejetées (vérifier si on rate quelque chose) :");
    for (const [cat, count] of topRejected) {
      console.log(`    ${cat.padEnd(42)} ${String(count).padStart(5)}  ${bar(count, maxR, 16)}`);
    }
  }

  console.log(`\n${SEP}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  CritEat — Import Overture Maps (GeoParquet)              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // ── 0. Vérifier que le fichier Parquet existe ─────────────────────────────
  if (!existsSync(PARQUET_PATH)) {
    console.error(
      `Fichier Parquet introuvable : ${PARQUET_PATH}\n\n` +
      "Télécharge-le d'abord avec overturemaps :\n" +
      "  pip install overturemaps\n" +
      "  overturemaps download --bbox=4.10,50.65,4.65,50.98 -f geoparquet --type=place -o scripts/bruxelles_places.parquet"
    );
    process.exit(1);
  }

  // ── 1. Initialiser DuckDB ─────────────────────────────────────────────────
  const require = createRequire(import.meta.url);
  let duckdb;
  try {
    duckdb = require("duckdb");
  } catch {
    console.error(
      "Package 'duckdb' introuvable.\n" +
      "Lance : cd scripts && npm install"
    );
    process.exit(1);
  }

  const db   = new duckdb.Database(":memory:");
  const conn = db.connect();

  // Charger l'extension spatiale (nécessaire pour ST_GeomFromWKB)
  process.stdout.write("  Chargement de l'extension spatiale DuckDB…");
  try {
    await dbExec(conn, "INSTALL spatial; LOAD spatial;");
    process.stdout.write(" ✓\n\n");
  } catch (err) {
    process.stdout.write(` ✗\n`);
    console.error(`Impossible de charger l'extension spatiale : ${err.message}`);
    process.exit(1);
  }

  // Chemin avec slashes forward (requis par DuckDB sur Windows)
  const parquetFwd = PARQUET_PATH.replace(/\\/g, "/");

  // ── 2. Compter les features totales ──────────────────────────────────────
  const countRows = await dbAll(
    conn,
    `SELECT COUNT(*) AS n FROM read_parquet('${parquetFwd}')`
  );
  const totalFeatures = Number(countRows[0]?.n ?? 0);
  console.log(`  Fichier  : ${PARQUET_PATH}`);
  console.log(`  Features : ${totalFeatures.toLocaleString()}\n`);

  // ── 3. Lire toutes les colonnes utiles ───────────────────────────────────
  process.stdout.write("  Lecture du fichier Parquet…");

  const query = `
    SELECT
      id,
      names.primary                    AS name,
      categories.primary               AS primary_category,
      categories.alternate             AS alternate_categories,
      confidence,
      addresses[1].freeform            AS address,
      addresses[1].locality            AS city,
      addresses[1].postcode            AS postcode,
      phones[1]                        AS phone,
      websites[1]                      AS website,
      ST_Y(geometry)                   AS latitude,
      ST_X(geometry)                   AS longitude
    FROM read_parquet('${parquetFwd}')
  `;

  let rows;
  try {
    rows = await dbAll(conn, query);
  } catch (err) {
    process.stdout.write("\n");
    console.error(`Erreur lors de la lecture du Parquet : ${err.message}`);
    process.exit(1);
  }
  process.stdout.write(`\r  ✓ ${rows.length.toLocaleString()} features lues\n\n`);

  // ── 4. Filtrage, mapping, déduplication ──────────────────────────────────
  const stats = {
    totalFeatures,
    rejectedCategory:    0,
    rejectedConfidence:  0,
    rejectedName:        0,
    rejectedCoords:      0,
    upsertErrors:        0,
    rejectedCategoryMap: {},
  };

  const dedupMap = new Map();

  process.stdout.write("  Filtrage et mapping…");

  for (const row of rows) {
    try {
      const primaryCat    = row.primary_category ?? "";
      const alternateCats = Array.isArray(row.alternate_categories)
        ? row.alternate_categories
        : [];

      // Filtre catégorie food
      if (!hasFoodCategory(primaryCat, alternateCats)) {
        stats.rejectedCategory++;
        const key = primaryCat || "unknown";
        stats.rejectedCategoryMap[key] = (stats.rejectedCategoryMap[key] ?? 0) + 1;
        continue;
      }

      // Filtre confiance
      const confidence = row.confidence ?? 1;
      if (confidence < MIN_CONFIDENCE) {
        stats.rejectedConfidence++;
        continue;
      }

      // Filtre nom
      const name = typeof row.name === "string" ? row.name.trim() : null;
      if (!name) {
        stats.rejectedName++;
        continue;
      }

      // Filtre coordonnées
      const lat = row.latitude;
      const lng = row.longitude;
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        stats.rejectedCoords++;
        continue;
      }

      const place_id = `overture_${row.id}`;

      const restaurant = {
        place_id,
        name,
        category:        resolveCategory(primaryCat, alternateCats),
        address:         (typeof row.address === "string" && row.address.trim()) || "Adresse non renseignée",
        city:            (typeof row.city    === "string" && row.city.trim())    || "Bruxelles",
        postcode:        row.postcode  ?? null,
        latitude:        lat,
        longitude:       lng,
        phone:           row.phone    ?? null,
        website:         row.website  ?? null,
        opening_hours:   null,
        description:     null,
        takeaway:        null,
        delivery:        null,
        outdoor_seating: null,
        wheelchair:      null,
        diet_options:    null,
        source:          "overture",
      };

      // Déduplication : garder la version la plus complète
      const existing = dedupMap.get(place_id);
      if (!existing || dataScore(restaurant) > dataScore(existing)) {
        dedupMap.set(place_id, restaurant);
      }
    } catch {
      stats.rejectedCoords++;
    }
  }

  const allRestaurants = [...dedupMap.values()];

  process.stdout.write(
    `\r  ✓ ${allRestaurants.length.toLocaleString()} restaurants valides` +
    `  |  ${stats.rejectedCategory.toLocaleString()} hors-food` +
    `  |  ${stats.rejectedConfidence} faible confiance` +
    `  |  ${stats.rejectedName} sans nom\n\n`
  );

  if (allRestaurants.length === 0) {
    console.log("Aucun restaurant valide trouvé. Vérifie le fichier Parquet.");
    process.exit(0);
  }

  // ── 5. Upsert Supabase par batches ────────────────────────────────────────
  const totalBatches = Math.ceil(allRestaurants.length / BATCH_SIZE);
  console.log(
    `  Upsert Supabase — ${allRestaurants.length.toLocaleString()} restaurants → ${totalBatches} batch(s)\n`
  );

  for (let b = 0; b < totalBatches; b++) {
    const batch = allRestaurants.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const pct   = Math.round(((b + 1) / totalBatches) * 100);
    process.stdout.write(
      `\r  [${String(pct).padStart(3)}%] Batch ${String(b + 1).padStart(4)}/${totalBatches}…`
    );
    try {
      await upsertBatch(batch);
    } catch (err) {
      stats.upsertErrors++;
      process.stdout.write(`\n  ⚠ Batch ${b + 1} échoué : ${err.message}\n`);
    }
  }
  process.stdout.write("\r" + " ".repeat(58) + "\r");

  if (stats.upsertErrors === 0) {
    console.log("  ✓ Tous les batches insérés avec succès.\n");
  } else {
    console.log(`  ⚠ ${stats.upsertErrors} batch(s) en erreur — les autres ont été insérés.\n`);
  }

  // ── 6. Résumé ─────────────────────────────────────────────────────────────
  printFinalStats(allRestaurants, stats);
}

main().catch((err) => {
  console.error("\nErreur fatale :", err.message);
  process.exit(1);
});
