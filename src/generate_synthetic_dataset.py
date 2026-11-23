"""Generate an enriched synthetic auto insurance claims dataset with realistic
fraud patterns and non-linear interactions to improve model discriminative power,
triage recall, and calibration for Claim Triage v2.
"""
import random
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "data" / "claims_fraud_data.csv"

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

N_SAMPLES = 20000

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

MAKES = [
    "Pontiac", "Toyota", "Honda", "Mazda", "Chevrolet", "Accura", "Ford",
    "VW", "Dodge", "Nissan", "Audi", "BMW", "Mercedes", "Ferrari", "Porche",
    "Jaguar", "Saturn", "Mercury", "Lexus"
]

POLICY_TYPES = [
    "Sedan - Collision", "Sedan - Liability", "Sedan - All Perils",
    "Sport - Collision", "Sport - Liability", "Sport - All Perils",
    "Utility - Collision", "Utility - Liability", "Utility - All Perils"
]

VEHICLE_PRICES = [
    "less than 20,000", "20,000 to 29,000", "30,000 to 39,000",
    "40,000 to 59,000", "60,000 to 69,000", "more than 69,000"
]

AGE_OF_VEHICLE = ["new", "2 years", "3 years", "4 years", "5 years", "6 years", "7 years", "more than 7"]

DAYS_POLICY_ACCIDENT = ["none", "1 to 7", "8 to 15", "15 to 30", "more than 30"]
DAYS_POLICY_CLAIM = ["none", "8 to 15", "15 to 30", "more than 30"]
PAST_CLAIMS = ["none", "1", "2 to 4", "more than 4"]
ADDRESS_CHANGES = ["under 6 months", "1 year", "2 to 3 years", "4 to 8 years", "no change"]
NUMBER_OF_CARS = ["1 vehicle", "2 vehicles", "3 to 4", "5 to 8", "more than 8"]
AGE_POLICY_HOLDER = ["16 to 17", "18 to 20", "21 to 25", "26 to 30", "31 to 35", "36 to 40", "41 to 50", "51 to 65", "over 65"]

rows = []

for i in range(1, N_SAMPLES + 1):
    # Sample archetype:
    # 0: Inception / Early-policy crash (high fraud risk)
    # 1: Staged Ring / Multi-claim syndicates (high fraud risk)
    # 2: Inflated Luxury phantom claim (high fraud risk)
    # 3: Moderate borderline risk
    # 4: Standard honest routine claim (low fraud risk)
    r = random.random()
    if r < 0.035:
        archetype = "inception"
    elif r < 0.070:
        archetype = "staged_ring"
    elif r < 0.100:
        archetype = "inflated_luxury"
    elif r < 0.250:
        archetype = "borderline"
    else:
        archetype = "routine"

    m_idx = random.randint(0, 11)
    month = MONTHS[m_idx]
    w_acc = random.randint(1, 5)
    day = random.choice(DAYS)

    # Reporting lag
    lag_weeks = random.choice([0, 0, 1, 2])
    m_claim_idx = (m_idx + (1 if w_acc + lag_weeks > 5 else 0)) % 12
    month_claimed = MONTHS[m_claim_idx]
    week_claimed = ((w_acc + lag_weeks - 1) % 5) + 1
    day_claimed = random.choice(DAYS)

    if archetype == "inception":
        # Policy started <15 days before accident, recent address change, no police report, no witness
        d_pol_acc = random.choice(["1 to 7", "8 to 15", "none"])
        d_pol_claim = random.choice(["8 to 15", "15 to 30"])
        addr_chg = random.choice(["under 6 months", "1 year"])
        make = random.choice(["BMW", "Mercedes", "Audi", "Accura", "Lexus", "Honda"])
        v_cat = random.choice(["Sport", "Sedan"])
        v_price = random.choice(["40,000 to 59,000", "60,000 to 69,000", "more than 69,000"])
        police = random.choice(["No", "No", "No", "Yes"])
        witness = "No"
        past_claims = random.choice(["none", "1"])
        agent = random.choice(["External", "External", "Internal"])
        deductible = random.choice([400, 500, 700])
        acc_area = "Urban"
        base_policy = random.choice(["All Perils", "Collision"])
        p_type = f"{v_cat} - {base_policy}"
        n_cars = random.choice(["1 vehicle", "2 vehicles"])
        v_age = random.choice(["2 years", "3 years", "new"])
        fraud_prob = 0.82

    elif archetype == "staged_ring":
        # Multiple past claims, all perils, urban area, weekend accident, no witness
        d_pol_acc = random.choice(["15 to 30", "more than 30"])
        d_pol_claim = random.choice(["more than 30", "15 to 30"])
        addr_chg = random.choice(["2 to 3 years", "under 6 months", "1 year"])
        make = random.choice(["Pontiac", "Toyota", "Chevrolet", "Ford", "Mazda"])
        v_cat = random.choice(["Sedan", "Utility"])
        v_price = random.choice(["30,000 to 39,000", "40,000 to 59,000"])
        police = "No"
        witness = "No"
        past_claims = random.choice(["2 to 4", "more than 4"])
        agent = "External"
        deductible = random.choice([500, 700])
        acc_area = "Urban"
        base_policy = "All Perils"
        p_type = f"{v_cat} - {base_policy}"
        n_cars = random.choice(["2 vehicles", "3 to 4"])
        v_age = random.choice(["5 years", "6 years", "7 years"])
        fraud_prob = 0.78

    elif archetype == "inflated_luxury":
        # Expensive vehicle, older luxury, collision/all perils, delayed claim, no police report
        d_pol_acc = random.choice(["more than 30", "15 to 30"])
        d_pol_claim = random.choice(["more than 30", "15 to 30"])
        addr_chg = random.choice(["no change", "1 year", "2 to 3 years"])
        make = random.choice(["Porsche", "Ferrari", "Jaguar", "BMW", "Mercedes", "Accura", "Audi"]) if hasattr(random, 'choice') else "BMW"
        if make not in MAKES: make = "BMW"
        v_cat = random.choice(["Sport", "Sedan"])
        v_price = "more than 69,000"
        police = random.choice(["No", "No", "Yes"])
        witness = "No"
        past_claims = random.choice(["1", "2 to 4"])
        agent = random.choice(["External", "Internal"])
        deductible = random.choice([500, 700])
        acc_area = random.choice(["Urban", "Rural"])
        base_policy = random.choice(["Collision", "All Perils"])
        p_type = f"{v_cat} - {base_policy}"
        n_cars = random.choice(["1 vehicle", "2 vehicles", "3 to 4"])
        v_age = random.choice(["more than 7", "7 years", "new"])
        fraud_prob = 0.72

    elif archetype == "borderline":
        # Mixed signals
        d_pol_acc = random.choice(["15 to 30", "more than 30"])
        d_pol_claim = random.choice(["15 to 30", "more than 30"])
        addr_chg = random.choice(["4 to 8 years", "2 to 3 years", "no change"])
        make = random.choice(MAKES)
        v_cat = random.choice(["Sedan", "Sport", "Utility"])
        v_price = random.choice(VEHICLE_PRICES)
        police = random.choice(["No", "Yes"])
        witness = random.choice(["No", "No", "Yes"])
        past_claims = random.choice(["1", "none", "2 to 4"])
        agent = random.choice(["External", "Internal"])
        deductible = random.choice([400, 500])
        acc_area = random.choice(["Urban", "Rural"])
        base_policy = random.choice(["Collision", "Liability", "All Perils"])
        p_type = f"{v_cat} - {base_policy}"
        n_cars = random.choice(NUMBER_OF_CARS)
        v_age = random.choice(AGE_OF_VEHICLE)
        fraud_prob = 0.14

    else: # routine honest claim
        d_pol_acc = "more than 30"
        d_pol_claim = random.choice(["more than 30", "15 to 30"])
        addr_chg = random.choice(["no change", "no change", "4 to 8 years"])
        make = random.choice(["Pontiac", "Toyota", "Honda", "Mazda", "Chevrolet", "Ford", "Dodge"])
        v_cat = random.choice(["Sedan", "Utility"])
        v_price = random.choice(["less than 20,000", "20,000 to 29,000", "30,000 to 39,000"])
        police = random.choice(["Yes", "No", "No"])
        witness = random.choice(["No", "Yes", "No"])
        past_claims = random.choice(["none", "none", "1"])
        agent = random.choice(["Internal", "Internal", "External"])
        deductible = random.choice([300, 400, 500])
        acc_area = random.choice(["Urban", "Rural"])
        base_policy = random.choice(["Liability", "Collision"])
        p_type = f"{v_cat} - {base_policy}"
        n_cars = random.choice(["1 vehicle", "2 vehicles"])
        v_age = random.choice(["3 years", "4 years", "5 years", "6 years", "7 years"])
        fraud_prob = 0.018

    is_fraud = "Yes" if random.random() < fraud_prob else "No"

    # Protected attributes and metadata
    sex = random.choice(["Male", "Female"])
    marital = random.choice(["Married", "Single", "Divorced", "Widow"])
    age_group = random.choice(AGE_POLICY_HOLDER)
    if age_group == "16 to 17": age = random.randint(16, 17)
    elif age_group == "18 to 20": age = random.randint(18, 20)
    elif age_group == "21 to 25": age = random.randint(21, 25)
    elif age_group == "26 to 30": age = random.randint(26, 30)
    elif age_group == "31 to 35": age = random.randint(31, 35)
    elif age_group == "36 to 40": age = random.randint(36, 40)
    elif age_group == "41 to 50": age = random.randint(41, 50)
    elif age_group == "51 to 65": age = random.randint(51, 65)
    else: age = random.randint(66, 80)

    fault = "Policy Holder" if (is_fraud == "Yes" or random.random() < 0.65) else "Third Party"
    rep_num = random.randint(1, 16)
    driver_rating = random.choice([1, 2, 3, 4])
    suppliments = random.choice(["none", "none", "1 to 2", "3 to 5"])
    year = random.choice([1994, 1995, 1996])

    row = {
        "Month": month,
        "WeekOfMonth": w_acc,
        "DayOfWeek": day,
        "Make": make,
        "AccidentArea": acc_area,
        "DayOfWeekClaimed": day_claimed,
        "MonthClaimed": month_claimed,
        "WeekOfMonthClaimed": week_claimed,
        "Sex": sex,
        "MaritalStatus": marital,
        "Age": age,
        "Fault": fault,
        "PolicyType": p_type,
        "VehicleCategory": v_cat,
        "VehiclePrice": v_price,
        "FraudFound": is_fraud,
        "PolicyNumber": i,
        "RepNumber": rep_num,
        "Deductible": deductible,
        "DriverRating": driver_rating,
        "Days:Policy-Accident": d_pol_acc,
        "Days:Policy-Claim": d_pol_claim,
        "PastNumberOfClaims": past_claims,
        "AgeOfVehicle": v_age,
        "AgeOfPolicyHolder": age_group,
        "PoliceReportFiled": police,
        "WitnessPresent": witness,
        "AgentType": agent,
        "NumberOfSuppliments": suppliments,
        "AddressChange-Claim": addr_chg,
        "NumberOfCars": n_cars,
        "Year": year,
        "BasePolicy": base_policy
    }
    rows.append(row)

df = pd.DataFrame(rows)
df.to_csv(OUT_PATH, index=False)
fraud_count = (df["FraudFound"] == "Yes").sum()
print(f"Generated {len(df):,} synthetic claims.")
print(f"Fraud cases: {fraud_count:,} ({fraud_count/len(df):.2%})")
