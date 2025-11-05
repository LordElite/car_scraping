const express = require("express");
const axios = require("axios");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.use(express.json());

// --- 🚘 Vehicle Score Function ---
const computeScore = (item) => {
  const currentYear = new Date().getFullYear();
  const year = parseInt(item.year) || 2000;
  const yearScore = Math.min(Math.max(((year - 2000) / (currentYear - 2000)) * 100, 0), 100);
  const miles = parseInt(item.odometer?.replace(/[^0-9]/g, "")) || 0;
  const odometerScore = 100 - Math.min(miles / 3000, 100);
  const damageMap = {
    "MINOR DENT/SCRATCHES": 90, "NORMAL WEAR": 85, "FRONT END": 60,
    "REAR END": 60, "SIDE": 55, "VANDALISM": 50, "ROLLOVER": 30,
    "BURN": 10, "TOTAL BURN": 0
  };
  const damageScore = damageMap[item.primary_damage?.toUpperCase()] || 50;
  const highlights = (item.highlights || "").toString().toUpperCase();
  const highlightsScore = highlights.includes("RUN") ? 100 : highlights.includes("START") ? 80 : 50;
  const driveScore = /ALL|AWD/.test(item.drive?.toUpperCase() || "") ? 90 : 70;
  const engineScore = /V8/.test(item.engine?.toUpperCase() || "") ? 70 : 85;

  const totalScore =
    yearScore * 0.25 +
    odometerScore * 0.25 +
    damageScore * 0.30 +
    highlightsScore * 0.10 +
    driveScore * 0.05 +
    engineScore * 0.05;

  return Math.min(Math.max(totalScore.toFixed(1), 0), 100);
};

// --- Homepage ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// --- Copart Endpoint ---
app.get("/search-copart", async (req, res) => {
  const { make, model, yearFrom, yearTo, odometerFrom, odometerTo, location, damage, condition, type } = req.query;

  // 🔹 Validación básica: al menos uno de estos campos debe estar presente
  if (!make && !model && !location && !damage && !condition && !type) {
    return res.status(400).send("Please provide at least one search filter.");
  }

  // 🔹 Construcción de la URL base
  const searchParams = new URLSearchParams();
  if (make) searchParams.append("make", make);
  if (model) searchParams.append("model", model);
  if (yearFrom) searchParams.append("year_from", yearFrom);
  if (yearTo) searchParams.append("year_to", yearTo);
  if (odometerFrom) searchParams.append("odometer_from", odometerFrom);
  if (odometerTo) searchParams.append("odometer_to", odometerTo);
  if (location) searchParams.append("location", location);
  if (damage) searchParams.append("primary_damage", damage);
  if (condition && condition !== "all") searchParams.append("condition", condition);
  if (type) searchParams.append("type", type);

  const token = process.env.APIFY_TOKEN;
  const copartActor = `https://api.apify.com/v2/acts/parseforge~copart-public-search-scraper/run-sync-get-dataset-items?token=${token}`;

  try {
    const response = await axios.post(copartActor, {
      startUrl: `https://www.copart.com/lotSearchResults/?${searchParams.toString()}`,
      maxItems: 100,
    });

    const data = response.data;

    if (!data || data.length === 0) {
      return res.send(`<p style="text-align:center;">No results found for <strong>${query}</strong>.</p>`);
    }
    
    // --- Normalización ---
    const normalize = (item) => ({
      Make: item.make || "N/A",
      Model: item.model || "N/A",
      Year: parseInt(item.year) || null,
      VinNumber: item.vin || "N/A",
      PrimaryDamage: item.primary_damage || "N/A",
      DriveTrain: item.drive || "N/A",
      EngineType: item.engine || "N/A",
      Color: item.color || "N/A",
      Highlights: Array.isArray(item.highlights) ? item.highlights.join(", ") : (item.highlights || "N/A"),
      Odometer: item.odometer || "N/A",
      Location: item.location || "N/A",
      LotNumber: item.lot_number || "N/A",
      ItemURL: item.item_url || "N/A",
      Score: computeScore(item),
    });
    
    // --- Filtro adicional por año ---
    const yearFrom = parseInt(req.query.yearFrom) || null;
    const yearTo = parseInt(req.query.yearTo) || null;
    
    let vehicles = data.map(normalize);
    
    if (yearFrom || yearTo) {
      vehicles = vehicles.filter(v => {
        if (!v.Year) return false;
        if (yearFrom && v.Year < yearFrom) return false;
        if (yearTo && v.Year > yearTo) return false;
        return true;
      });
    }
    
    if (vehicles.length === 0) {
      return res.send(`<p style="text-align:center;">No vehicles found between ${yearFrom || "?"} and ${yearTo || "?"}.</p>`);
    }

    res.json({ vehicles });

  } catch (error) {
    console.error("❌ Error Copart:", error.response?.data || error.message);
    res.status(500).send("Error fetching data from Apify Copart.");
  }
});


// --- IAAI Endpoint ---
app.post("/search-iaai", async (req, res) => {
  const { stockNumber } = req.body;
  if (!stockNumber) return res.status(400).json({ error: "Missing stock number or URL." });

  const token = process.env.APIFY_TOKEN;
  const iaaiActor = `https://api.apify.com/v2/acts/easyapi~iaai-vehicle-detail-scraper/run-sync-get-dataset-items?token=${token}`;

  try {
    // 🔹 Construye la URL correcta para el actor
    const detailUrl = stockNumber.startsWith("http")
      ? stockNumber
      : `https://www.iaai.com/VehicleDetail/${stockNumber}~US`;

    // 🔹 Ejecuta el actor
    const response = await axios.post(iaaiActor, {
      detailUrls: [detailUrl],
      proxyConfiguration: { useApifyProxy: false },
    });

    const data = response.data;
    if (!data || data.length === 0) {
      console.log("⚠️ Actor IAAI no devolvió resultados");
      return res.json({ vehicles: [] });
    }

    // 🔹 Normaliza los campos según los datos reales
    const item = data[0];
    const normalized = {
      "Stock #": item["Stock #"] || "N/A",
      "Branch": item["Branch"] || "N/A",
      "Primary Damage": item["Primary Damage"] || "N/A",
      "Odometer": item["Odometer"] || "N/A",
      "Vehicle": item["Vehicle"] || "N/A",
      "Engine": item["Engine"] || "N/A",
      "Drive Line Type": item["Drive Line Type"] || "N/A",
      "Transmission": item["Transmission"] || "N/A",
      "Fuel Type": item["Fuel Type"] || "N/A",
      "Body Style": item["Body Style"] || "N/A",
      "Color": item["Exterior/Interior"] || "N/A",
      "VIN (Status)": item["VIN (Status)"] || "N/A",
      "Actual Cash Value": item["Actual Cash Value"] || "N/A",
      "Location": item["Vehicle Location"] || "N/A",
      "Title/Sale Doc": item["Title/Sale Doc"] || "N/A",
      "Start Code": item["Start Code"] || "N/A",
      "Key": item["Key"] || "N/A",
      "Auction Date and Time": item["Auction Date and Time"] || "N/A",
      "Item URL": detailUrl,
    };

    res.json({ vehicles: [normalized] });
  } catch (error) {
    console.error("❌ Error fetching IAAI:", error.response?.data || error.message);
    res.status(500).json({ error: "Error fetching IAAI data." });
  }
});




app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

