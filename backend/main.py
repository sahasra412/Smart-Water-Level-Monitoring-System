import os
import psycopg2
import threading
import time
import random
from datetime import datetime

from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import joblib

# Load environment variables
load_dotenv()

app = FastAPI()

# -------------------------------
# LOAD ML MODEL (SAFE)
# -------------------------------
try:
    model = joblib.load("model.pkl")
    print("✅ Model loaded successfully")
except Exception as e:
    print("❌ Model loading failed:", e)
    model = None

# -------------------------------
# CORS
# -------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# DATABASE CONNECTION
# -------------------------------
def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSLMODE", "require")
    )

# -------------------------------
# CREATE TABLES
# -------------------------------
def create_tables():
    conn = get_connection()
    cur = conn.cursor()

    # Sensor table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sensor_data(
        id SERIAL PRIMARY KEY,
        node_id TEXT,
        field1 FLOAT,
        field2 FLOAT,
        created_at TIMESTAMP
    )
    """)

    # Tank parameters
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tank_sensorparameters(
        id SERIAL PRIMARY KEY,
        node_id TEXT,
        tank_height_cm FLOAT,
        tank_length_cm FLOAT,
        tank_width_cm FLOAT,
        lat FLOAT,
        long FLOAT
    )
    """)

    # Predictions table (NO DROP ❌)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS predictions(
        id SERIAL PRIMARY KEY,
        input_value FLOAT,
        predicted_value FLOAT,
        created_at TIMESTAMP
    )
    """)

    conn.commit()
    cur.close()
    conn.close()

# -------------------------------
# MODEL FUNCTION
# -------------------------------
def simple_model(input_value):
    if model is None:
        return round(input_value + random.uniform(-5, 5), 2)  # fallback
    return round(model.predict([[input_value]])[0], 2)

# -------------------------------
# SENSOR SIMULATION
# -------------------------------
NODE_ID = "NODE_001"

def generate_data():
    distance = round(95 + random.uniform(-10, 10), 2)
    temperature = round(21 + random.uniform(-2, 2), 2)
    return distance, temperature

# -------------------------------
# SENSOR THREAD
# -------------------------------
def sensor_collector():
    while True:
        try:
            distance, temperature = generate_data()

            conn = get_connection()
            cur = conn.cursor()

            cur.execute("""
            INSERT INTO sensor_data(node_id, field1, field2, created_at)
            VALUES(%s, %s, %s, %s)
            """, (NODE_ID, distance, temperature, datetime.now()))

            conn.commit()
            cur.close()
            conn.close()

            print("✅ Sensor data inserted")

        except Exception as e:
            print("❌ Sensor error:", e)

        time.sleep(20)

# -------------------------------
# ROOT (FIXED YOUR ISSUE)
# -------------------------------
@app.get("/")
def root():
    return {"message": "API is running 🚀"}

# -------------------------------
# SENSOR DATA
# -------------------------------
@app.get("/sensor-data")
def get_sensor_data():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT id, node_id,
               field1 AS distance,
               field2 AS temperature,
               created_at
        FROM sensor_data
        ORDER BY created_at DESC
        LIMIT 100
    """)

    data = cur.fetchall()
    cur.close()
    conn.close()

    return data

# -------------------------------
# TANK PARAMETERS
# -------------------------------
@app.get("/tank-parameters")
def get_tank_parameters():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT * FROM tank_sensorparameters")

    data = cur.fetchall()
    cur.close()
    conn.close()

    return data

# -------------------------------
# PREDICT API
# -------------------------------
@app.post("/predict")
def predict(data: dict = Body(...)):
    try:
        input_value = data.get("value") or data.get("input")

        if input_value is None:
            return {"error": "Input required"}

        input_value = float(input_value)
        prediction = simple_model(input_value)

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
        INSERT INTO predictions(input_value, predicted_value, created_at)
        VALUES(%s, %s, %s)
        """, (input_value, prediction, datetime.now()))

        conn.commit()
        cur.close()
        conn.close()

        return {
            "input": input_value,
            "prediction": prediction
        }

    except Exception as e:
        return {"error": str(e)}

# -------------------------------
# HISTORY
# -------------------------------
@app.get("/history")
def get_history():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
    SELECT input_value, predicted_value, created_at
    FROM predictions
    ORDER BY created_at DESC
    LIMIT 50
    """)

    data = cur.fetchall()
    cur.close()
    conn.close()

    return {"history": data}

# -------------------------------
# MODEL INFO
# -------------------------------
@app.get("/model-info")
def model_info():
    return {
        "model": "ML Model",
        "status": "loaded" if model else "fallback"
    }

# -------------------------------
# STARTUP
# -------------------------------
@app.on_event("startup")
def startup():
    create_tables()

    thread = threading.Thread(target=sensor_collector)
    thread.daemon = True
    thread.start()