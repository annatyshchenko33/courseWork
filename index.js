require("dotenv").config();
const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const app = express();
  const port = 8000;
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.json());

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  connection.connect((err) => {
    if (err) {
      console.error("Error connecting to MySQL database: " + err.stack);
      return;
    }
    console.log("Connected to MySQL database as id " + connection.threadId);
  });

  async function saveForecastDataToDatabase(forecastData, city) {
    for (const day of forecastData.forecast.forecastday) {
      const sql = `INSERT INTO forecast (city, condition_text, max_temp, min_temp, date) VALUES (?, ?, ?, ?, ?)`;
      const values = [
        city,
        day.day.condition.text,
        day.day.maxtemp_c,
        day.day.mintemp_c,
        new Date(day.date),
      ];
      try {
        const result = await connection.query(sql, values);
        console.log("1 record inserted");
      } catch (err) {
        console.error("Error inserting into the database: ", err);
        throw err;
      }
    }
  }

  app.get("/weather-analytics", async (req, res) => {
    try {
      const [analyticsData] = await connection.query(`
        SELECT 
          AVG(max_temp) AS avgMaxTemp, 
          AVG(min_temp) AS avgMinTemp, 
          SUM(IF(condition_text LIKE '%sunny%', 1, 0)) AS sunnyDays, 
          SUM(IF(condition_text LIKE '%rain%', 1, 0)) AS rainyDays, 
          SUM(IF(condition_text LIKE '%snow%', 1, 0)) AS snowyDays 
        FROM (
          SELECT * FROM forecast ORDER BY id DESC LIMIT 5
        ) AS recent_forecast
      `);
      res.json({
        avgMaxTemp: analyticsData[0].avgMaxTemp,
        avgMinTemp: analyticsData[0].avgMinTemp,
        sunnyDays: analyticsData[0].sunnyDays,
        rainyDays: analyticsData[0].rainyDays,
        snowyDays: analyticsData[0].snowyDays,
      });
    } catch (error) {
      console.error("Error fetching weather analytics:", error);
      res
        .status(500)
        .json({ error: "Something went wrong fetching weather analytics" });
    }
  });

  app.post("/save-forecast", async (req, res) => {
    if (
      !req.body ||
      !req.body.city ||
      !req.body.max_temp ||
      !req.body.min_temp ||
      !req.body.date ||
      !req.body.condition_text
    ) {
      res.status(400).send("Missing required fields");
      return;
    }

    const { city, max_temp, min_temp, date, condition_text } = req.body;
    console.log(
      "Received data:",
      city,
      max_temp,
      min_temp,
      date,
      condition_text
    );

    const sql = `INSERT INTO forecast (city, max_temp, min_temp, date, condition_text) VALUES (?, ?, ?, ?, ?)`;
    const values = [city, max_temp, min_temp, date, condition_text];

    try {
      const result = await connection.query(sql, values);
      console.log("1 record inserted");

      res.send({ message: "Data saved successfully" });
    } catch (err) {
      console.error("Error inserting into the database: ", err);
      res.status(500).send({ error: "Something failed!" });
    }
  });

  app.get("/weather", async (req, res) => {
    const city = req.query.city;
    const { default: fetch } = await import("node-fetch");
    const apiKey = process.env.API_KEY;
    const apiUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${city}&days=5&aqi=no&alerts=no`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      await saveForecastDataToDatabase(data, city);

      res.send(data);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({ error: "Something failed!" });
    }
  });

  app.get("/chart-data", async (req, res) => {
    try {
      const [rows] = await connection.query(
        "SELECT * FROM forecast ORDER BY id DESC LIMIT 5"
      );
      const maxTemperatures = rows.map((row) => row.max_temp);
      const minTemperatures = rows.map((row) => row.min_temp);
      const dates = rows.map((row) => row.date);
      res.send({ maxTemperatures, minTemperatures, dates });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res
        .status(500)
        .send({ error: "Something went wrong fetching analytics" });
    }
  });

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

main();
