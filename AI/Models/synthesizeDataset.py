import pandas as pd
import numpy as np
import random

NUM_ROWS_TO_GENERATE = 100000
OUTPUT_FILE_NAME = 'syntheticReservationData.csv'
RESTAURANT_TABLES = [2, 2, 2, 4, 4, 4, 4, 6, 6, 8]
BASE_SPEND_PER_GUEST = 35.0 # Dollars
PRIME_TIME_HOURS = [12, 13, 19, 20]
HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
HOUR_WEIGHTS = [
    0.05, 0.08, # Breakfast 
    0.1, 0.15, 0.15, # Lunch Rush 
    0.05, 0.02, # Afternoon
    0.1, 0.1, # Early Dinner
    0.15, 0.15, # Prime Dinner
    0.05, 0.04, 0.01 # Late Night
]

dataset = []

for i in range(NUM_ROWS_TO_GENERATE):
    
    is_weekend = random.choice([True, False])
    time_of_day = random.choices(HOURS, weights=HOUR_WEIGHTS, k=1)[0]

    num_of_guests = random.choices([1, 2, 3, 4, 5, 6, 7, 8], weights=[0.05, 0.4, 0.05, 0.3, 0.05, 0.1, 0.02, 0.03])[0]
    customer_visit_count = random.choices(
        population=[0, 1, 2, 3, 4, 5, 8, 10, 15, 20, 25, 50],
        weights=[0.4, 0.15, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.04, 0.03, 0.02, 0.01]
    )[0]

    base_spend_dist = np.random.normal(30, 10) # Normal distribution centered at $30
    visit_bonus = customer_visit_count * 0.5 # Small bonus for loyalty
    customer_avg_spend = max(15, base_spend_dist + visit_bonus) # Min $15/person
    
    # Calculate Occupancy (State)
    base_occ = 0.75 if time_of_day in PRIME_TIME_HOURS else 0.3
    if is_weekend: base_occ += 0.15
    occupancy = np.clip(base_occ + np.random.normal(0, 0.1), 0.0, 1.0)
    
    # Generate Action
    possible_tables = [t for t in RESTAURANT_TABLES if t >= num_of_guests]
    
    # Randomly decide to Accept or Reject to create diverse training data
    if not possible_tables:
        action_type = 'reject'
        assigned_table_capacity = 0
    else:
        rejection_chance = 0.5 if occupancy > 0.85 else 0.1
        if random.random() < rejection_chance:
            action_type = 'reject'
            assigned_table_capacity = 0
        else:
            action_type = 'accept'
            # Randomly pick a table (efficient or wasteful)
            if random.random() < 0.7:
                assigned_table_capacity = min(possible_tables) # Efficient
            else:
                assigned_table_capacity = random.choice(possible_tables) # Random/Wasteful

    wasted_seats = max(0, assigned_table_capacity - num_of_guests)
    
    # Duration (Target for Model 1)
    is_lunch = 11 <= time_of_day <= 14
    base_duration = 30 if is_lunch else 45
    
    duration = base_duration + (num_of_guests * 5) 
    if is_weekend: duration += 15
    
    actual_duration = max(30, duration + random.randint(-10, 15)) # Min 30 mins

    # Revenue (Immediate Reward)
    if action_type == 'reject':
        price_paid = 0
    else:
        # Regulars might splurge (+20%), or have a light meal (-10%)
        check_variance = random.uniform(0.8, 1.2) 
        price_paid = round(customer_avg_spend * num_of_guests * check_variance, 2)

    # We calculate how much "potential money" we lost by taking this action.
    opportunity_cost = 0
    
    if action_type == 'accept':
        # The "Waste" Penalty
        opportunity_cost += (wasted_seats * 15) 

        # The "Busy Tax" (Prime Time Threshold)
        if time_of_day in PRIME_TIME_HOURS and occupancy > 0.6:
             # High Opportunity Cost during Prime Time
             opportunity_cost += 50
             
             # If occupancy is EXTREME (>90%), cost is even higher
             if occupancy > 0.9:
                 opportunity_cost += 50 # Total $100 tax

    # FINAL Q CALCULATION
    # Scenario A (Regular): Pay $30 - BusyTax $50 = -20 (Bad Decision)
    # Scenario B (VIP): Pay $80 - BusyTax $50 = +30 (Good Decision)
    target_q_value = price_paid - opportunity_cost

    dataset.append({
        # INPUTS (Features)
        'isWeekend': is_weekend,
        'timeOfDay': time_of_day,
        'occupancy': round(occupancy, 2),
        'numOfGuests': num_of_guests,
        'customerVisitCount': customer_visit_count,
        'customerAvgSpend': round(customer_avg_spend, 2),
        
        # ACTION
        'actionType': action_type,
        'assignedTableCapacity': assigned_table_capacity,
        'wastedSeats': wasted_seats,
        
        # TARGETS
        'actualDuration': actual_duration, # Target for Model 1 
        'targetQValue': round(target_q_value, 2) # Target for Model 2 (not used for walk-in)
    })

# Save
df = pd.DataFrame(dataset)
df.to_csv(OUTPUT_FILE_NAME, index=False)