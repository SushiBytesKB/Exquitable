import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow import keras
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

print(f"TensorFlow Version: {tf.__version__}")

try:
    df = pd.read_csv('synthetic_restaurant_data_v2.csv')
    print("Data loaded successfully.")
except FileNotFoundError:
    print("ERROR: Please upload 'synthetic_restaurant_data_v2.csv' to Colab.")
    # Exit or raise error if file is missing
    raise

FEATURES = [
    'isWeekend',          # Boolean/Categorical
    'timeOfDay',          # Numerical/Categorical
    'occupancy',          # Numerical
    'numOfGuests',        # Numerical
    'customerVisitCount', # Numerical
    'customerAvgSpend'    # Numerical
]
TARGET = 'actual_duration' # The duration in minutes

X = df[FEATURES]
y = df[TARGET]

# Convert 'isWeekend' from bool to int (0 or 1)
X['isWeekend'] = X['isWeekend'].astype(int)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

scaler = StandardScaler()

# Identify columns to scale
cols_to_scale = ['occupancy', 'numOfGuests', 'customerVisitCount', 'customerAvgSpend']

# Fit scaler on TRAINING data and transform both sets
X_train[cols_to_scale] = scaler.fit_transform(X_train[cols_to_scale])
X_test[cols_to_scale] = scaler.transform(X_test[cols_to_scale])

print("\nData preparation complete. Ready for training.")
print(f"Training set size: {X_train.shape}")

model = keras.Sequential([
    # Input layer must match the number of features
    keras.layers.Dense(64, activation='relu', input_shape=(X_train.shape[1],)), 
    keras.layers.Dense(32, activation='relu'),
    # Output layer: 1 neuron, NO activation function for a regression task
    keras.layers.Dense(1) 
])

model.compile(
    optimizer='adam',
    loss='mse',
    metrics=['mae'] # Mean Absolute Error (Average error in minutes)
)

print("\nModel summary:")
model.summary()

# Train the Model
history = model.fit(
    X_train,
    y_train,
    epochs=50, # 50 epochs is a good starting point
    batch_size=32,
    validation_split=0.1, # Use 10% of training data for validation
    verbose=1
)


# Evaluate the Model
loss, mae = model.evaluate(X_test, y_test, verbose=0)
print("\n====================================")
print(f"FINAL TEST EVALUATION:")
print(f"Loss (MSE): {loss:.2f}")
print(f"Mean Absolute Error (MAE): {mae:.2f} minutes")
print("====================================")

MODEL_FILENAME = 'duration_predictor.h5'
model.save(MODEL_FILENAME)
print(f"\nModel saved successfully as: {MODEL_FILENAME}")

import joblib
SCALER_FILENAME = 'duration_scaler.joblib'
joblib.dump(scaler, SCALER_FILENAME)
print(f"Scaler saved successfully as: {SCALER_FILENAME}")