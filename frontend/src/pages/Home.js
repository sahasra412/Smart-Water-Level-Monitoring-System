import React, { useEffect, useState } from "react";
import axios from "axios";
import config from "../config";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import "../App.css";

function Home() {

  const [waterLevel, setWaterLevel] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [history, setHistory] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState("CONNECTING");

  const [input, setInput] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [predictionHistory, setPredictionHistory] = useState([]);

  const [backendStatus, setBackendStatus] = useState("CONNECTING");

  const tankHeight = 200;

  // -------------------------------
  // DEMO DATA
  // -------------------------------
  const DEMO_DATA = [
    { distance: 90, temperature: 25, created_at: new Date().toISOString() },
    { distance: 80, temperature: 26, created_at: new Date(Date.now() - 60000).toISOString() },
    { distance: 70, temperature: 24, created_at: new Date(Date.now() - 120000).toISOString() }
  ];

  // -------------------------------
  // PROCESS DATA
  // -------------------------------
  const processData = (data, mode) => {
    const latest = data[0];

    const distance = Number(latest.distance);
    const temp = Number(latest.temperature);

    const percent = Math.round(((tankHeight - distance) / tankHeight) * 100);

    setWaterLevel(percent);
    setTemperature(temp);
    setDeviceStatus(mode);

    const chartData = data.slice(0, 10).map(d => ({
      time: new Date(d.created_at).toLocaleTimeString(),
      water: Math.round(((tankHeight - Number(d.distance)) / tankHeight) * 100),
      temp: Number(d.temperature)
    }));

    setHistory(chartData.reverse());
  };

  // -------------------------------
  // FETCH SENSOR DATA
  // -------------------------------
  const fetchData = async () => {
    try {
      const res = await axios.get(config.SENSOR_DATA_URL);
      const data = res.data;

      if (!data || data.length === 0) throw new Error();

      localStorage.setItem("sensorData", JSON.stringify(data));

      processData(data, "LIVE");
      setBackendStatus("LIVE");

    } catch (err) {
      setBackendStatus("OFFLINE");

      const saved = localStorage.getItem("sensorData");

      if (saved) {
        processData(JSON.parse(saved), "CACHED");
      } else {
        processData(DEMO_DATA, "DEMO");
      }
    }
  };

  // -------------------------------
  // FETCH PREDICTION HISTORY
  // -------------------------------
  const fetchPredictionHistory = async () => {
    try {
      const res = await axios.get(config.HISTORY_URL);

      const formatted = res.data.history.map(item => ({
        predicted_value: item.predicted_value,
        created_at: new Date(item.created_at).toLocaleTimeString()
      }));

      setPredictionHistory(formatted.slice(-10));

    } catch (err) {
      console.log("History unavailable");
    }
  };

  // -------------------------------
  // PREDICT FUNCTION (PRO)
  // -------------------------------
  const handlePredict = async () => {
    try {
      if (!input) return;

      const res = await axios.post(config.PREDICTION_URL, {
        value: Number(input)
      });

      const newPrediction = res.data.prediction;

      setPrediction(newPrediction);
      setBackendStatus("LIVE");

      const newPoint = {
        predicted_value: newPrediction,
        created_at: new Date().toLocaleTimeString()
      };

      // ✅ Smooth graph update (last 10 only)
      setPredictionHistory(prev => [
        ...prev.slice(-9),
        newPoint
      ]);

      fetchPredictionHistory();

    } catch (err) {
      setBackendStatus("OFFLINE");

      const fallback = Math.round(Number(input) * 1.1);
      setPrediction(fallback);

      const newPoint = {
        predicted_value: fallback,
        created_at: new Date().toLocaleTimeString()
      };

      setPredictionHistory(prev => [
        ...prev.slice(-9),
        newPoint
      ]);
    }
  };

  // -------------------------------
  // AUTO REFRESH
  // -------------------------------
  useEffect(() => {
    fetchData();
    fetchPredictionHistory();

    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------
  // STATUS
  // -------------------------------
  let status = "NORMAL";
  let alertMessage = "";

  if (waterLevel < 20) {
    status = "LOW";
    alertMessage = "⚠ Water Level Low!";
  }

  if (waterLevel > 90) {
    status = "FULL";
    alertMessage = "⚠ Tank Almost Full!";
  }

  // -------------------------------
  // UI
  // -------------------------------
  return (

    <div className="dashboard">

      <h1 className="title">Smart Water Level Monitoring System</h1>

      {/* Backend Status */}
      <div className={`backend-status ${backendStatus.toLowerCase()}`}>
        {backendStatus === "LIVE" && "🟢 Backend Online"}
        {backendStatus === "OFFLINE" && "🔴 Backend Offline"}
        {backendStatus === "CONNECTING" && "🟡 Connecting..."}
      </div>

      {/* Device Status */}
      <div className={`device-status ${deviceStatus.toLowerCase()}`}>
        {deviceStatus === "LIVE" && "🟢 DEVICE LIVE"}
        {deviceStatus === "CACHED" && "🟡 USING SAVED DATA"}
        {deviceStatus === "DEMO" && "🔵 DEMO MODE"}
        {deviceStatus === "CONNECTING" && "🟠 CONNECTING..."}
      </div>

      {alertMessage && <div className="alert-box">{alertMessage}</div>}

      <div className="top-section">

        {/* WATER */}
        <div className="card">
          <h3>Water Level</h3>
          <div className="tank">
            <div className="water" style={{ height: `${waterLevel}%` }}>
              <div className="wave"></div>
            </div>
          </div>
          <h2 className="value">{waterLevel}%</h2>
        </div>

        {/* TEMP */}
        <div className="card">
          <h3>Temperature</h3>
          <div className="temp-display">🌡 {temperature}°C</div>
        </div>

        {/* STATUS */}
        <div className="card">
          <h3>Status</h3>
          <div className={`status ${status.toLowerCase()}`}>
            {status}
          </div>
        </div>

        {/* PREDICTION */}
        <div className="card">
          <h3>Prediction</h3>

          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter value"
            style={{ padding: "10px", width: "80%", marginBottom: "10px" }}
          />

          <button onClick={handlePredict} style={{ padding: "10px 20px" }}>
            Predict
          </button>

          <h3 style={{ marginTop: "10px" }}>
            Result: {prediction !== null ? prediction : "—"}
          </h3>
        </div>

      </div>

      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h3>Model: Linear Regression</h3>
      </div>

      <div className="charts">

        {/* WATER */}
        <div className="chart-card">
          <h3>Water History</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="water" 
                stroke="#38bdf8" 
                strokeWidth={4} 
                dot={false}
                isAnimationActive={true}
                animationDuration={500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* TEMP */}
        <div className="chart-card">
          <h3>Temperature History</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="temp" 
                stroke="#fb7185" 
                strokeWidth={4} 
                dot={false}
                isAnimationActive={true}
                animationDuration={500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* PREDICTION */}
        <div className="chart-card">
          <h3>Prediction History</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={predictionHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="created_at" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="predicted_value" 
                stroke="#22c55e" 
                strokeWidth={4}
                isAnimationActive={true}
                animationDuration={600}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );
}

export default Home;