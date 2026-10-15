
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from datetime import datetime, timezone
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

client = MongoClient(
    os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/"),
    serverSelectionTimeoutMS=5000
)
db = client[os.getenv("DB_NAME", "StudentFinancialAid")]

students = db["students"]
schemes = db["aidschemes"]
applications = db["applications"]

students.create_index("studentId", unique=True)
students.create_index("email", unique=True)

VALID_STATUSES = [
    "Pending", "Under Verification", "Approved", "Rejected"
]


def now():
    return datetime.now(timezone.utc)


def serialize(doc):
    if not doc:
        return doc
    result = dict(doc)
    result["_id"] = str(result["_id"])
    for key in ("createdAt", "updatedAt"):
        if isinstance(result.get(key), datetime):
            result[key] = result[key].isoformat()
    return result


def public_student(student):
    if not student:
        return None
    return {
        "_id": str(student["_id"]),
        "name": student.get("name", ""),
        "studentId": student.get("studentId", ""),
        "email": student.get("email", ""),
        "department": student.get("department", ""),
        "year": student.get("year", ""),
        "phone": student.get("phone", ""),
        "familyIncome": student.get("familyIncome", 0),
        "createdAt": student.get("createdAt", now()).isoformat()
    }


def message(text, status=200, **extra):
    return jsonify({"message": text, **extra}), status


def valid_id(value):
    return ObjectId.is_valid(value)


@app.get("/api/health")
def health():
    try:
        client.admin.command("ping")
        return jsonify({"message": "Backend and MongoDB connected"})
    except Exception:
        return jsonify({"message": "MongoDB connection failed"}), 500


# STUDENT REGISTRATION
@app.post("/api/students/register")
def register_student():
    data = request.get_json(silent=True) or {}

    required = ["name", "studentId", "email", "password"]
    if any(not str(data.get(k, "")).strip() for k in required):
        return message("Please fill all required fields.", 400)

    email = data["email"].strip().lower()
    student_id = data["studentId"].strip()

    if students.find_one({
        "$or": [{"email": email}, {"studentId": student_id}]
    }):
        return message("Email or Student ID already exists.", 409)

    try:
        student = {
            "name": data["name"].strip(),
            "studentId": student_id,
            "email": email,
            "password": generate_password_hash(data["password"]),
            "department": data.get("department", ""),
            "year": data.get("year", ""),
            "phone": data.get("phone", ""),
            "familyIncome": float(data.get("familyIncome") or 0),
            "createdAt": now(),
            "updatedAt": now()
        }
        students.insert_one(student)
        return message("Registration successful!", 201)
    except Exception:
        return message("Could not register student. Check the details.", 400)


# STUDENT LOGIN
@app.post("/api/students/login")
def login_student():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    student = students.find_one({"email": email})
    if not student or not check_password_hash(
        student.get("password", ""), password
    ):
        return message("Invalid email or password.", 401)

    return jsonify({
        "message": "Login successful!",
        "student": public_student(student)
    })


# LIST ALL AID SCHEMES
@app.get("/api/aid-schemes")
def get_schemes():
    data = [serialize(s) for s in schemes.find().sort("createdAt", -1)]
    return jsonify(data)


# ADD A SCHEME
@app.post("/api/aid-schemes")
def add_scheme():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    try:
        amount = float(data.get("amount"))
        if not name or amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return message("Enter a valid scheme name and amount.", 400)

    scheme = {
        "name": name,
        "amount": amount,
        "description": data.get("description", ""),
        "eligibility": data.get("eligibility", ""),
        "requiredDocuments": data.get("requiredDocuments", ""),
        "deadline": data.get("deadline", ""),
        "createdAt": now(),
        "updatedAt": now()
    }
    result = schemes.insert_one(scheme)
    scheme["_id"] = result.inserted_id
    return message("Aid scheme added successfully!", 201, scheme=serialize(scheme))


# EDIT A SCHEME
@app.put("/api/aid-schemes/<scheme_id>")
def edit_scheme(scheme_id):
    if not valid_id(scheme_id):
        return message("Invalid scheme ID.", 400)

    data = request.get_json(silent=True) or {}
    updates = {}

    allowed = [
        "name", "description", "eligibility",
        "requiredDocuments", "deadline"
    ]
    for key in allowed:
        if key in data:
            updates[key] = data[key]

    if "amount" in data:
        try:
            updates["amount"] = float(data["amount"])
            if updates["amount"] <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return message("Enter a valid amount.", 400)

    if "name" in updates and not str(updates["name"]).strip():
        return message("Scheme name cannot be empty.", 400)

    updates["updatedAt"] = now()
    result = schemes.update_one(
        {"_id": ObjectId(scheme_id)}, {"$set": updates}
    )

    if result.matched_count == 0:
        return message("Scheme not found.", 404)

    return message("Scheme updated successfully!")


# DELETE A SCHEME
@app.delete("/api/aid-schemes/<scheme_id>")
def delete_scheme(scheme_id):
    if not valid_id(scheme_id):
        return message("Invalid scheme ID.", 400)

    result = schemes.delete_one({"_id": ObjectId(scheme_id)})
    if result.deleted_count == 0:
        return message("Scheme not found.", 404)

    return message("Scheme deleted successfully!")


# SUBMIT AN APPLICATION
@app.post("/api/applications")
def submit_application():
    data = request.get_json(silent=True) or {}

    required = [
        "studentId", "studentName", "schemeId",
        "schemeName", "documentName"
    ]
    if any(not str(data.get(k, "")).strip() for k in required):
        return message("Please provide all application details.", 400)

    student = students.find_one({
        "studentId": str(data["studentId"]).strip()
    })
    if not student:
        return message("Student not found. Please login again.", 404)

    if not valid_id(str(data["schemeId"])):
        return message("Invalid scheme ID.", 400)

    scheme = schemes.find_one({"_id": ObjectId(data["schemeId"])})
    if not scheme:
        return message("Aid scheme not found.", 404)

    application = {
        "studentId": student["studentId"],
        "studentName": student["name"],
        "schemeId": str(scheme["_id"]),
        "schemeName": scheme["name"],
        "familyIncome": float(student.get("familyIncome", 0) or 0),
        "documentName": str(data["documentName"]).strip(),
        "status": "Pending",
        "remarks": "",
        "createdAt": now(),
        "updatedAt": now()
    }

    result = applications.insert_one(application)
    application["_id"] = result.inserted_id
    return message(
        "Application submitted successfully!",
        201,
        application=serialize(application)
    )


# ALL APPLICATIONS (ADMIN)
@app.get("/api/applications")
def get_all_applications():
    data = [
        serialize(a)
        for a in applications.find().sort("createdAt", -1)
    ]
    return jsonify(data)


# APPLICATIONS FOR ONE STUDENT
@app.get("/api/applications/student/<student_id>")
def get_student_applications(student_id):
    data = [
        serialize(a)
        for a in applications.find(
            {"studentId": student_id}
        ).sort("createdAt", -1)
    ]
    return jsonify(data)


# UPDATE APPLICATION STATUS
@app.put("/api/applications/<application_id>/status")
def update_application_status(application_id):
    if not valid_id(application_id):
        return message("Invalid application ID.", 400)

    data = request.get_json(silent=True) or {}
    status = data.get("status", "")

    if status not in VALID_STATUSES:
        return message("Invalid application status.", 400)

    result = applications.update_one(
        {"_id": ObjectId(application_id)},
        {"$set": {
            "status": status,
            "remarks": data.get("remarks", ""),
            "updatedAt": now()
        }}
    )

    if result.matched_count == 0:
        return message("Application not found.", 404)

    return message("Application status updated successfully!")


# ADMIN DASHBOARD STATISTICS
@app.get("/api/admin/stats")
def admin_stats():
    return jsonify({
        "students": students.count_documents({}),
        "schemes": schemes.count_documents({}),
        "applications": applications.count_documents({}),
        "approved": applications.count_documents({"status": "Approved"}),
        "pending": applications.count_documents({"status": "Pending"}),
        "rejected": applications.count_documents({"status": "Rejected"})
    })


if __name__ == "__main__":
    try:
        client.admin.command("ping")
        print("MongoDB connected successfully.")
    except Exception as error:
        print("MongoDB connection error:", error)

    print("Student Financial Aid backend running on port 5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
