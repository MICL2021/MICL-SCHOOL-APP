const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const app = express();
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const noticeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, PNG or WEBP files are allowed"));
    }
  }
});
async function uploadHomeworkFile(file) {
  if (!file) return null;

  const isPdf = file.mimetype === "application/pdf";

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "micl-homework",
        resource_type: isPdf ? "raw" : "image"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(file.buffer);
  });

  return {
    url: uploaded.secure_url,
    name: file.originalname
  };
}

async function uploadStudentPhoto(file) {
  if (!file) return null;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    throw new Error("Student photo must be JPG, PNG or WEBP");
  }

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "micl-student-photos",
        resource_type: "image"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(file.buffer);
  });

  return uploaded.secure_url;
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "micl.db"));
const SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_BEFORE_DEPLOYMENT";
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));
app.use('/public', express.static(path.join(__dirname, 'public')));
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',class_name TEXT,section TEXT,admission_no TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY AUTOINCREMENT,day TEXT,period INTEGER,subject TEXT,teacher TEXT);
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,date TEXT,status TEXT,subject TEXT,FOREIGN KEY(student_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS homework(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,description TEXT,due_date TEXT);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,exam TEXT,subject TEXT,marks REAL,max_marks REAL,FOREIGN KEY(student_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,description TEXT,event_date TEXT);
CREATE TABLE IF NOT EXISTS homework(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  due_date TEXT,
  file_url TEXT,
  file_name TEXT,
  created_by INTEGER
);
`);
const timetableColumns = db
  .prepare("PRAGMA table_info(timetable)")
  .all()
  .map(column => column.name);

const timetableExtraColumns = [
  ["class_name", "TEXT DEFAULT ''"],
  ["section", "TEXT DEFAULT ''"],
  ["start_time", "TEXT DEFAULT ''"],
  ["end_time", "TEXT DEFAULT ''"]
];

for (const [column, type] of timetableExtraColumns) {
  if (!timetableColumns.includes(column)) {
    db.exec(`ALTER TABLE timetable ADD COLUMN ${column} ${type}`);
  }
}
const noticeColumns = db
  .prepare("PRAGMA table_info(notices)")
  .all()
  .map(column => column.name);

if (!noticeColumns.includes("attachment_url")) {
  db.exec("ALTER TABLE notices ADD COLUMN attachment_url TEXT");
}

if (!noticeColumns.includes("attachment_name")) {
  db.exec("ALTER TABLE notices ADD COLUMN attachment_name TEXT");
}

if (!noticeColumns.includes("signature_url")) {
  db.exec("ALTER TABLE notices ADD COLUMN signature_url TEXT");
}
const homeworkColumns = db
  .prepare("PRAGMA table_info(homework)")
  .all()
  .map(column => column.name);

if (!homeworkColumns.includes("file_url")) {
  db.exec("ALTER TABLE homework ADD COLUMN file_url TEXT");
}

if (!homeworkColumns.includes("file_name")) {
  db.exec("ALTER TABLE homework ADD COLUMN file_name TEXT");
}

if (!homeworkColumns.includes("created_by")) {
  db.exec("ALTER TABLE homework ADD COLUMN created_by INTEGER");
}
const homeworkStatusColumns = db
  .prepare("PRAGMA table_info(homework)")
  .all()
  .map(column => column.name);

if (!homeworkStatusColumns.includes("status")) {
  db.exec(
    "ALTER TABLE homework ADD COLUMN status TEXT NOT NULL DEFAULT 'published'"
  );
}

const homeworkColumnsForClass = db
  .prepare("PRAGMA table_info(homework)")
  .all()
  .map(column => column.name);

if (!homeworkColumnsForClass.includes("class_name")) {
  db.exec("ALTER TABLE homework ADD COLUMN class_name TEXT DEFAULT ''");
}

if (!homeworkColumnsForClass.includes("section")) {
  db.exec("ALTER TABLE homework ADD COLUMN section TEXT DEFAULT ''");
}

const columns = [
  ["father_name", "TEXT"],
  ["mother_name", "TEXT"],
  ["dob", "TEXT"],
  ["phone", "TEXT"],
  ["qualification", "TEXT"],
  ["address", "TEXT"],
  ["caste", "TEXT"],
  ["aadhaar_no", "TEXT"],
  ["apaar_no", "TEXT"],
  ["udise_pen", "TEXT"],
  ["roll_no", "TEXT"],
["exam_roll_no", "TEXT"],
  ["username", "TEXT"],
  ["photo", "TEXT"],
  ["designation", "TEXT"],
["school_name", "TEXT"]
];

for (const [column, type] of columns) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
  } catch (err) {
    if (!err.message.includes("duplicate column name")) {
      throw err;
    }
  }
}
  
db.exec(`
CREATE TABLE IF NOT EXISTS fee_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  total_fee REAL NOT NULL DEFAULT 0,
  paid_fee REAL NOT NULL DEFAULT 0,
  balance_fee REAL NOT NULL DEFAULT 0,
  last_payment_date TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'Pending'
);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS fee_payment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    transaction_id TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    section TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS online_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    fields_json TEXT NOT NULL DEFAULT '[]',
    fee REAL NOT NULL DEFAULT 0,
    last_date TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS form_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_email TEXT DEFAULT '',
    applicant_phone TEXT DEFAULT '',
    answers_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Received',
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES online_forms(id)
  );
`);

const applicationColumns = [
  ["student_photo", "TEXT"],
  ["payment_status", "TEXT NOT NULL DEFAULT 'Pending'"],
  ["razorpay_order_id", "TEXT"],
  ["razorpay_payment_id", "TEXT"]
];

for (const [column, definition] of applicationColumns) {
  const columns = db.prepare(
    "PRAGMA table_info(form_applications)"
  ).all();

  if (!columns.some(item => item.name === column)) {
    db.exec(
      `ALTER TABLE form_applications ADD COLUMN ${column} ${definition}`
    );
  }
}

function seed(){
 const admin=db.prepare("SELECT id FROM users WHERE role='admin'").get();
 if(!admin) db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)").run("MICL Admin","admin@micl.edu",bcrypt.hashSync("Admin@123",10),"admin");
 const stu=db.prepare("SELECT id FROM users WHERE admission_no='MICL-0001'").get();
 if(!stu){const r=db.prepare("INSERT INTO users(name,email,password,role,class_name,section,admission_no) VALUES(?,?,?,?,?,?,?)").run("Demo Student","student@micl.edu",bcrypt.hashSync("Student@123",10),"student","8th","A","MICL-0001");
  const sid=r.lastInsertRowid; for(const [s,m] of [["English",88],["Mathematics",92],["Science",90]]) db.prepare("INSERT INTO results(student_id,exam,subject,marks,max_marks) VALUES(?,?,?,?,?)").run(sid,"Unit Test 1",s,m,100);
  ["English","Mathematics","Science","Social Science"].forEach((s,i)=>db.prepare("INSERT INTO attendance(student_id,date,status,subject) VALUES(?,?,?,?)").run(sid,"2026-10-01","Present",s));
 }
 if(db.prepare("SELECT count(*) c FROM notices").get().c===0) db.prepare("INSERT INTO notices(title,body) VALUES(?,?)").run("Welcome to MICL","Welcome to the official Modern Institute of Creative Learning school app.");
}
seed();

app.post("/api/admin/subjects", auth, admin, (req, res) => {
  const name = String(req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({
      error: "Subject name is required"
    });
  }

  try {
    const result = db.prepare(
      "INSERT INTO subjects(name) VALUES(?)"
    ).run(name);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      name,
      message: "Subject added successfully"
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "This subject already exists"
      });
    }

    console.error(error);
    res.status(500).json({
      error: "Could not add subject"
    });
  }
});

app.get("/api/admin/subjects", auth, admin, (req, res) => {
  const subjects = db.prepare(
    "SELECT id, name FROM subjects ORDER BY name ASC"
  ).all();

  res.json(subjects);
});

/* MICL ONLINE FORM MANAGEMENT */

// List all forms for Admin
app.get("/api/admin/forms", auth, admin, (req, res) => {
  const forms = db.prepare(
    "SELECT * FROM online_forms ORDER BY id DESC"
  ).all();

  res.json(forms);
});

// Create a form
app.post("/api/admin/forms", auth, admin, (req, res) => {
  const {
    title, description, fields, fee, last_date
  } = req.body;

  if (!String(title || "").trim()) {
    return res.status(400).json({
      error: "Form title is required"
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO online_forms
      (title, description, fields_json, fee, last_date, status)
      VALUES (?, ?, ?, ?, ?, 'Draft')
    `).run(
      String(title).trim(),
      String(description || ""),
      JSON.stringify(Array.isArray(fields) ? fields : []),
      Math.max(0, Number(fee) || 0),
      String(last_date || "")
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: "Form created as Draft"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create form" });
  }
});

// Edit a form
app.put("/api/admin/forms/:id", auth, admin, (req, res) => {
  const { title, description, fields, fee, last_date } = req.body;

  if (!String(title || "").trim()) {
    return res.status(400).json({ error: "Form title is required" });
  }

  const result = db.prepare(`
    UPDATE online_forms
    SET title = ?, description = ?, fields_json = ?,
        fee = ?, last_date = ?
    WHERE id = ?
  `).run(
    String(title).trim(),
    String(description || ""),
    JSON.stringify(Array.isArray(fields) ? fields : []),
    Math.max(0, Number(fee) || 0),
    String(last_date || ""),
    Number(req.params.id)
  );

  if (!result.changes) {
    return res.status(404).json({ error: "Form not found" });
  }

  res.json({ success: true, message: "Form updated" });
});

// Publish or close a form
app.patch("/api/admin/forms/:id/status", auth, admin, (req, res) => {
  const status = String(req.body.status || "");

  if (!["Draft", "Published", "Closed"].includes(status)) {
    return res.status(400).json({ error: "Invalid form status" });
  }

  const result = db.prepare(
    "UPDATE online_forms SET status = ? WHERE id = ?"
  ).run(status, Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Form not found" });
  }

  res.json({ success: true, status });
});

// Public list of published forms
app.get("/api/forms", (req, res) => {
  const forms = db.prepare(`
    SELECT id, title, description, fields_json, fee, last_date
    FROM online_forms
    WHERE status = 'Published'
    ORDER BY id DESC
  `).all();

  res.json(forms);
});

// Receive an application
app.post(
  "/api/forms/:id/applications",
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Student photo must be JPG, PNG or WEBP"));
  }}).single("student_photo"),
  async (req, res) => {
  const form = db.prepare(`
    SELECT id FROM online_forms
    WHERE id = ? AND status = 'Published'
  `).get(Number(req.params.id));

  if (!form) {
    return res.status(404).json({
      error: "Published form not found"
    });
  }

  const {
    applicant_name, applicant_email,
    applicant_phone, answers
  } = req.body;

  if (!String(applicant_name || "").trim()) {
    return res.status(400).json({
      error: "Applicant name is required"
    });
  }

  const studentPhoto = req.file
  ? await uploadStudentPhoto(req.file)
  : null;

const result = db.prepare(`
  INSERT INTO form_applications
  (form_id, applicant_name, applicant_email,
   applicant_phone, answers_json, student_photo)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  form.id,
  String(applicant_name).trim(),
  String(applicant_email || ""),
  String(applicant_phone || ""),
  JSON.stringify(
    answers && typeof answers === "object" ? answers : {}
  ),
  studentPhoto
);

  res.json({
    success: true,
    application_id: result.lastInsertRowid,
    status: "Received"
  });
});

// Admin: view received applications
app.get("/api/admin/applications", auth, admin, (req, res) => {
  const applications = db.prepare(`
    SELECT a.*, f.title AS form_title
    FROM form_applications a
    JOIN online_forms f ON f.id = a.form_id
    ORDER BY a.id DESC
  `).all();

  res.json(applications);
});

// Admin: update application status
app.patch("/api/admin/applications/:id/status", auth, admin, (req, res) => {
  const status = String(req.body.status || "");

  if (!["Received", "Under Review", "Accepted", "Rejected"].includes(status)) {
    return res.status(400).json({
      error: "Invalid application status"
    });
  }

  const result = db.prepare(
    "UPDATE form_applications SET status = ? WHERE id = ?"
  ).run(status, Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({
      error: "Application not found"
    });
  }

  res.json({ success: true, status });
});

app.post("/api/login",(req,res)=>{
const {email,password,role}=req.body;
const login=String(email||"").trim();
const u=db.prepare("SELECT * FROM users WHERE email=? OR admission_no=? OR username=?").get(login,login,login);
if (!u || !bcrypt.compareSync(password || "", u.password)) {
  return res.status(401).json({ error: "Invalid username/email or password" });
}

if (u.role !== role) {
  return res.status(401).json({ error: "Wrong login role or username/password" });
}
const token=jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"7d"});

res.json({
  token,
  user: {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    phone: u.phone || "",
    role: u.role,
    class_name: u.class_name,
    section: u.section,
    admission_no: u.admission_no,
father_name: u.father_name || "",
mother_name: u.mother_name || "",
dob: u.dob || "",
address: u.address || "",
caste: u.caste || "",
    photo: u.photo || ""
  }
});

});
function auth(req,res,next){try{const h=req.headers.authorization||"";req.user=jwt.verify(h.replace("Bearer ",""),SECRET);next()}catch(e){res.status(401).json({error:"Unauthorized"})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin access required"});next()}
function teacherOnly(req, res, next) {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "Teacher access required"
    });
  }
  next();
}

app.get("/api/teacher/students", auth, teacherOnly, (req, res) => {
  try {
    const teacher = db.prepare(
      "SELECT class_name, section FROM users WHERE id=? AND role='teacher'"
    ).get(req.user.id);

    if (!teacher || !teacher.class_name || !teacher.section) {
      return res.status(400).json({
        error: "No class assigned to this teacher"
      });
    }

    const students = db.prepare(`
      SELECT id, name, email, admission_no, class_name, section
      FROM users
      WHERE role='student'
        AND class_name=?
        AND section=?
      ORDER BY name ASC
    `).all(teacher.class_name, teacher.section);

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not load assigned students"
    });
  }
});

app.get("/api/teacher/attendance", auth, teacherOnly, (req, res) => {
  try {
    const teacher = db.prepare(
      "SELECT class_name, section FROM users WHERE id=? AND role='teacher'"
    ).get(req.user.id);

    if (!teacher || !teacher.class_name || !teacher.section) {
      return res.status(400).json({
        error: "No class assigned to this teacher"
      });
    }

    const records = db.prepare(`
      SELECT u.id AS student_id, u.name, u.admission_no,
             a.date, a.status, a.subject
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      WHERE u.role='student'
        AND u.class_name=?
        AND u.section=?
      ORDER BY a.date DESC
    `).all(teacher.class_name, teacher.section);

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not load class attendance"
    });
  }
});

app.get("/api/teacher/results", auth, teacherOnly, (req, res) => {
  try {
    const teacher = db.prepare(
      "SELECT class_name, section FROM users WHERE id=? AND role='teacher'"
    ).get(req.user.id);

    if (!teacher || !teacher.class_name || !teacher.section) {
      return res.status(400).json({
        error: "No class assigned to this teacher"
      });
    }

    const records = db.prepare(`
      SELECT u.id AS student_id, u.name, u.admission_no,
             r.exam, r.subject, r.marks, r.max_marks
      FROM results r
      JOIN users u ON u.id = r.student_id
      WHERE u.role='student'
        AND u.class_name=?
        AND u.section=?
      ORDER BY u.name ASC
    `).all(teacher.class_name, teacher.section);

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not load class results"
    });
  }
});
app.get("/api/admin/students",auth,admin,(req,res)=>{
  try{
    const students=db.prepare(`
     SELECT id,name,email,admission_no,class_name,section,roll_no,exam_roll_no,father_name,mother_name,dob,address,caste,aadhaar_no,udise_pen,apaar_no,phone
FROM users
      WHERE role='student'
      ORDER BY name ASC
    `).all();

    res.json(students);
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not load students"});
  }
});
app.put("/api/admin/students/:id",auth,admin,(req,res)=>{
  const {name,email,class_name,section,admission_no,phone}=req.body;

  if(!name || !email || !class_name || !section || !admission_no){
    return res.status(400).json({
      error:"All student details are required"
    });
  }

  try{
    const result=db.prepare(`
      UPDATE users
      SET name=?,
          email=?,
          class_name=?,
          section=?,
          admission_no=?,
phone=?
      WHERE id=? AND role='student'
    `).run(
      name,
      email,
      class_name,
      section,
      admission_no,
phone,
req.params.id
    );

    if(result.changes===0){
      return res.status(404).json({
        error:"Student not found"
      });
    }

    res.json({
      success:true,
      message:"Student updated successfully"
    });

  }catch(e){
    res.status(400).json({
      error:"Email or admission number already exists"
    });
  }
});


app.delete("/api/admin/students/:id",auth,admin,(req,res)=>{
  try{
    const result=db.prepare(
      "DELETE FROM users WHERE id=? AND role='student'"
    ).run(req.params.id);

    if(result.changes===0){
      return res.status(404).json({
        error:"Student not found"
      });
    }

    res.json({
      success:true,
      message:"Student deleted successfully"
    });

  }catch(e){
    res.status(500).json({
      error:"Failed to delete student"
    });
  }
});
// ADMIN PROFILE

app.get("/api/admin/profile",auth,admin,(req,res)=>{
  const user=db.prepare(
    "SELECT id,name,email,username,phone,photo,role,designation,school_name FROM users WHERE id=? AND role='admin'"
  ).get(req.user.id);

  if(!user){
    return res.status(404).json({error:"Admin profile not found"});
  }

  res.json(user);
});


app.put("/api/admin/profile", auth, admin, (req, res) => {
  const { name, phone, photo, designation, schoolName } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      error: "Admin name is required"
    });
  }

  db.prepare(
 "UPDATE users SET name=?, phone=?, photo=COALESCE(?, photo), designation=?, school_name=? WHERE id=? AND role='admin'"
).run(name.trim(), phone || "", photo || null, designation || "", schoolName || "", req.user.id);   

  res.json({ message: "Admin profile saved successfully" });
});


app.delete("/api/admin/profile",auth,admin,(req,res)=>{
  db.prepare(
    "UPDATE users SET name=?, phone=? WHERE id=? AND role='admin'"
  ).run("MICL Admin","",req.user.id);

  res.json({message:"Admin profile deleted/reset successfully"});
});
app.post("/api/change-password",auth,(req,res)=>{
  const {currentPassword,newPassword}=req.body;

  if(!currentPassword || !newPassword){
    return res.status(400).json({error:"Current and new password are required"});
  }

  if(newPassword.length < 6){
    return res.status(400).json({error:"New password must be at least 6 characters"});
  }

  const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);

  if(!user || !bcrypt.compareSync(currentPassword,user.password)){
    return res.status(401).json({error:"Current password is incorrect"});
  }

  const hashedPassword=bcrypt.hashSync(newPassword,10);

  db.prepare("UPDATE users SET password=? WHERE id=?").run(hashedPassword,req.user.id);

  res.json({message:"Password changed successfully"});
});
// Admin-only: reset a student's or teacher's password
app.post("/api/admin/reset-password", auth, admin, (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({
      error: "User ID and new password are required"
    });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({
      error: "Password must be at least 6 characters"
    });
  }

  const targetUser = db.prepare(
    "SELECT id, role FROM users WHERE id = ?"
  ).get(userId);

  if (!targetUser || !["student", "teacher"].includes(
    String(targetUser.role).toLowerCase()
  )) {
    return res.status(404).json({
      error: "Student or teacher not found"
    });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  db.prepare("UPDATE users SET password = ? WHERE id = ?")
    .run(hashedPassword, targetUser.id);

  return res.json({
    message: "Password reset successfully"
  });
});
app.get("/api/me", auth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT
        id,
        name,
        username,
        email,
        phone,
        role,
        class_name,
        section,
        admission_no,
        roll_no,
        exam_roll_no,
        father_name,
        mother_name,
        dob,
        address,
        caste,
        aadhaar_no,
        apaar_no,
        udise_pen,
        qualification,
        designation,
        school_name,
        photo
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User profile not found"
      });
    }

    res.json(user);
  } catch (error) {
    console.error("Profile loading error:", error);
    res.status(500).json({
      error: "Unable to load profile"
    });
  }
});
app.get("/api/notices",auth,(req,res)=>res.json(db.prepare("SELECT * FROM notices ORDER BY id DESC").all()));
app.get("/api/timetable",auth,(req,res)=>res.json(db.prepare("SELECT * FROM timetable ORDER BY CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END,period").all()));
app.get("/api/homework", auth, (req, res) => {
  const role = String(req.user.role || "").toLowerCase();

  if (role === "admin") {
    return res.json(
      db.prepare("SELECT * FROM homework ORDER BY due_date").all()
    );
  }

  if (role === "teacher") {
    return res.json(
      db.prepare(`
        SELECT * FROM homework
        WHERE status = 'published'
           OR (created_by = ? AND status = 'pending')
        ORDER BY due_date
      `).all(req.user.id)
    );
  }

  return res.json(
    db.prepare(`
      SELECT * FROM homework
      WHERE status = 'published'
      ORDER BY due_date
    `).all()
  );
});
app.get("/api/events",auth,(req,res)=>res.json(db.prepare("SELECT * FROM events ORDER BY event_date").all()));
app.get("/api/gallery",auth,(req,res)=>res.json(db.prepare("SELECT * FROM gallery ORDER BY id DESC").all()));
app.get("/api/attendance",auth,(req,res)=>res.json(db.prepare("SELECT date,status,subject FROM attendance WHERE student_id=? ORDER BY date DESC").all(req.user.id)));
app.get("/api/results",auth,(req,res)=>res.json(db.prepare("SELECT exam,subject,marks,max_marks FROM results WHERE student_id=? ORDER BY id DESC").all(req.user.id)));


app.post(
  "/api/admin/notices",
  auth,
  admin,
  noticeUpload.single("attachment"),
  async (req, res) => {
    try {
      const { title, body, signature } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({
          error: "Notice title is required"
        });
      }

      let attachmentUrl = null;
      let attachmentName = null;
      let signatureUrl = null;

      if (req.file) {
        const uploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "micl/notices",
              resource_type: "auto"
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );

          stream.end(req.file.buffer);
        });

        attachmentUrl = uploaded.secure_url;
        attachmentName = req.file.originalname;
      }

      if (signature) {
        if (!signature.startsWith("data:image/png;base64,")) {
          return res.status(400).json({
            error: "Invalid signature image"
          });
        }

        const uploadedSignature = await cloudinary.uploader.upload(
          signature,
          {
            folder: "micl/notices/signatures",
            resource_type: "image"
          }
        );

        signatureUrl = uploadedSignature.secure_url;
      }

      const result = db.prepare(`
        INSERT INTO notices
        (title, body, attachment_url, attachment_name, signature_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        title.trim(),
        body || "",
        attachmentUrl,
        attachmentName,
        signatureUrl
      );

      res.json({
        id: result.lastInsertRowid,
        message: "Notice published successfully"
      });
    } catch (error) {
      console.error("Notice upload error:", error);
      res.status(500).json({
        error: "Unable to publish notice. Please try again."
      });
    }
  }
);

app.delete("/api/admin/notices/:id", auth, admin, (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid notice ID" });
    }

    const result = db.prepare(
      "DELETE FROM notices WHERE id = ?"
    ).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Notice not found" });
    }

    res.json({ message: "Notice deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Unable to delete notice" });
  }
});

app.post(
  "/api/admin/homework",
  auth,
  noticeUpload.single("homeworkFile"),
  async (req, res) => {
    const role = String(req.user.role || "").toLowerCase();

    if (role !== "admin" && role !== "teacher") {
      return res.status(403).json({
        error: "Only Admin or Teacher can upload homework"
      });
    }

    const {
  title,
  description,
  due_date,
  class_name,
  section
} = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        error: "Homework title is required"
      });
    }

    try {
      const uploaded = await uploadHomeworkFile(req.file);
      const selectedClass = String(class_name || "").trim();
const selectedSection = String(section || "").trim();

if (!selectedClass || !selectedSection) {
  return res.status(400).json({
    error: "Class aur Section select karna zaroori hai."
  });
}

if (role === "teacher") {
  const teacher = db.prepare(
    "SELECT class_name, section FROM users WHERE id = ? AND role = 'teacher'"
  ).get(Number(req.user.id));

  if (
    !teacher ||
    String(teacher.class_name || "").trim() !== selectedClass ||
    String(teacher.section || "").trim() !== selectedSection
  ) {
    return res.status(403).json({
      error: "Aap sirf apni assigned class aur section ka homework upload kar sakte hain."
    });
  }
}
      const status = role === "admin" ? "published" : "pending";

      const result = db.prepare(`
        INSERT INTO homework
  (title, description, due_date, file_url, file_name,
   created_by, status, class_name, section)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(title).trim(),
        String(description || "").trim(),
        due_date || "",
        uploaded ? uploaded.url : "",
        uploaded ? uploaded.name : "",
        Number(req.user.id),
        status,
        selectedClass,
selectedSection
      );

      res.json({
        id: result.lastInsertRowid,
        status,
        message: status === "published"
          ? "Homework published successfully"
          : "Homework submitted for Admin approval"
      });
    } catch (error) {
      console.error("Homework upload error:", error);
      res.status(500).json({
        error: "Homework upload failed. Check Cloudinary settings."
      });
    }
  }
);

// Admin: publish pending homework
app.put("/api/admin/homework/:id/publish", auth, admin, (req, res) => {
  const result = db.prepare(
    "UPDATE homework SET status='published' WHERE id=?"
  ).run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Homework not found" });
  }

  res.json({ success: true, message: "Homework published successfully" });
});

// Admin: edit homework details
app.put("/api/admin/homework/:id", auth, admin, (req, res) => {
  const { title, description, due_date } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Homework title is required" });
  }

  const result = db.prepare(`
    UPDATE homework
    SET title=?, description=?, due_date=?
    WHERE id=?
  `).run(
    String(title).trim(),
    String(description || "").trim(),
    due_date || "",
    Number(req.params.id)
  );

  if (!result.changes) {
    return res.status(404).json({ error: "Homework not found" });
  }

  res.json({ success: true, message: "Homework updated successfully" });
});

// Admin: delete homework
app.delete("/api/admin/homework/:id", auth, admin, (req, res) => {
  const result = db.prepare(
    "DELETE FROM homework WHERE id=?"
  ).run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Homework not found" });
  }

  res.json({ success: true, message: "Homework deleted successfully" });
});
app.post("/api/admin/events",auth,admin,(req,res)=>{const {title,description,event_date}=req.body;const r=db.prepare("INSERT INTO events(title,description,event_date) VALUES(?,?,?)").run(title,description,event_date);res.json({id:r.lastInsertRowid})});
app.post("/api/admin/users",auth,admin,(req,res)=>{
  const {
    name,
    email,
    password,
    role,
    class_name,
    section,
    admission_no,
    roll_no,
exam_roll_no,
    father_name,
mother_name,
dob,
address,
caste,
    aadhaar_no,
udise_pen,
apaar_no,
    phone,
    qualification,
    username,
    photo
  }=req.body;
  try{
    
    const r=db.prepare(

"INSERT INTO users(name,email,password,role,class_name,section,admission_no,roll_no,exam_roll_no,father_name,mother_name,dob,address,caste,aadhaar_no,udise_pen,apaar_no,phone,qualification,username,photo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(
      name,
      email,
      bcrypt.hashSync(password,10),
      role||"student",
      class_name,
      section,
      admission_no,
      roll_no,
exam_roll_no,
      father_name,
mother_name,
dob,
address,
caste,
      aadhaar_no,
udise_pen,
apaar_no,
      phone,
      qualification,
      username,
      photo
    );

    res.json({id:r.lastInsertRowid});
  }catch(e){
    res.status(400).json({
      error:e.message
    });
  }
});
app.put("/api/admin/teachers/:id", auth, admin, (req, res) => {
  const { name, email, phone, qualification, username, password } = req.body;
  const id = Number(req.params.id);

  if (!id || !name || !email || !username) {
    return res.status(400).json({
      error: "Name, email and username are required"
    });
  }

  try {
    const teacher = db.prepare(
      "SELECT id FROM users WHERE id = ? AND role = 'teacher'"
    ).get(id);

    if (!teacher) {
      return res.status(404).json({
        error: "Teacher not found"
      });
    }

    if (password) {
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, qualification = ?,
            username = ?, password = ?
        WHERE id = ? AND role = 'teacher'
      `).run(
        name,
        email,
        phone,
        qualification,
        username,
        bcrypt.hashSync(password, 10),
        id
      );
    } else {
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, qualification = ?,
            username = ?
        WHERE id = ? AND role = 'teacher'
      `).run(
        name,
        email,
        phone,
        qualification,
        username,
        id
      );
    }

    res.json({
      success: true,
      message: "Teacher updated successfully"
    });

  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

/* ADMIN TIMETABLE MANAGEMENT */

// Add a timetable period
app.post("/api/admin/timetable", auth, admin, (req, res) => {
  const {
    class_name,
    section,
    day,
    period,
    subject,
    teacher,
    start_time,
    end_time
  } = req.body;

  if (
    !class_name || !section || !day ||
    !period || !subject || !teacher
  ) {
    return res.status(400).json({
      error: "Class, section, day, period, subject and teacher are required"
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO timetable
      (class_name, section, day, period, subject, teacher, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(class_name).trim(),
      String(section).trim(),
      String(day).trim(),
      Number(period),
      String(subject).trim(),
      String(teacher).trim(),
      start_time || "",
      end_time || ""
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: "Timetable period saved successfully"
    });
  } catch (error) {
    console.error("Timetable save error:", error);
    res.status(500).json({ error: "Could not save timetable" });
  }
});

// Edit a timetable period
app.put("/api/admin/timetable/:id", auth, admin, (req, res) => {
  const {
    class_name,
    section,
    day,
    period,
    subject,
    teacher,
    start_time,
    end_time
  } = req.body;

  if (
    !class_name || !section || !day ||
    !period || !subject || !teacher
  ) {
    return res.status(400).json({
      error: "Please fill all required timetable fields"
    });
  }

  try {
    const result = db.prepare(`
      UPDATE timetable
      SET class_name = ?, section = ?, day = ?, period = ?,
          subject = ?, teacher = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).run(
      String(class_name).trim(),
      String(section).trim(),
      String(day).trim(),
      Number(period),
      String(subject).trim(),
      String(teacher).trim(),
      start_time || "",
      end_time || "",
      Number(req.params.id)
    );

    if (!result.changes) {
      return res.status(404).json({ error: "Timetable period not found" });
    }

    res.json({ success: true, message: "Timetable updated successfully" });
  } catch (error) {
    console.error("Timetable edit error:", error);
    res.status(500).json({ error: "Could not update timetable" });
  }
});

// Delete a timetable period
app.delete("/api/admin/timetable/:id", auth, admin, (req, res) => {
  try {
    const result = db.prepare(
      "DELETE FROM timetable WHERE id = ?"
    ).run(Number(req.params.id));

    if (!result.changes) {
      return res.status(404).json({ error: "Timetable period not found" });
    }

    res.json({ success: true, message: "Timetable period deleted successfully" });
  } catch (error) {
    console.error("Timetable delete error:", error);
    res.status(500).json({ error: "Could not delete timetable" });
  }
});

app.post("/api/admin/classes", auth, admin, (req, res) => {
  const { name, section } = req.body;

  if (!name || !section) {
    return res.status(400).json({ error: "Class name and section are required" });
  }

  db.prepare(
    "INSERT INTO classes(name, section) VALUES(?, ?)"
  ).run(name, section);

  res.json({ success: true, message: "Class added successfully" });
});

app.get("/api/admin/classes", auth, admin, (req, res) => {
  const classes = db.prepare(
    "SELECT id, name, section FROM classes ORDER BY id DESC"
  ).all();

  res.json(classes);
});
app.delete("/api/admin/classes/:id", auth, admin, (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "Invalid class ID" });
  }

  const result = db.prepare(
    "DELETE FROM classes WHERE id=?"
  ).run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Class not found" });
  }

  res.json({
    success: true,
    message: "Class deleted successfully"
  });
});
app.put("/api/admin/classes/:id", auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const { name, section } = req.body;

  if (!id || !name || !section) {
    return res.status(400).json({
      error: "Class name and section are required"
    });
  }

  const result = db.prepare(
    "UPDATE classes SET name=?, section=? WHERE id=?"
  ).run(name, section, id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: "Class not found"
    });
  }

  res.json({
    success: true,
    message: "Class updated successfully"
  });
});
app.post("/api/admin/attendance",auth,admin,(req,res)=>{const {student_id,date,status,subject}=req.body;const r=db.prepare("INSERT INTO attendance(student_id,date,status,subject) VALUES(?,?,?,?)").run(student_id,date,status,subject);res.json({id:r.lastInsertRowid})});
app.post("/api/admin/results",auth,admin,(req,res)=>{const {student_id,exam,subject,marks,max_marks}=req.body;const r=db.prepare("INSERT INTO results(student_id,exam,subject,marks,max_marks) VALUES(?,?,?,?,?)").run(student_id,exam,subject,marks,max_marks);res.json({id:r.lastInsertRowid})});
app.get("/api/admin/students", auth, admin, (req,res) => {
  const students = db.prepare(`
    SELECT id, name, email, class_name, section, admission_no
    FROM users
    WHERE role = 'student'
    ORDER BY id DESC
  `).all();
  res.json(students);
});

app.get("/api/admin/teachers", auth, admin, (req,res) => {
  const teachers = db.prepare(`
    const teachers = db.prepare(`
  SELECT id, name, email, phone, qualification, photo, username, class_name, section
  FROM users
  WHERE role = 'teacher'
  ORDER BY id DESC
`).all();
  res.json(teachers);
});
app.delete("/api/admin/teachers/:id", auth, admin, (req, res) => {
    try {
        const result = db.prepare(
            "DELETE FROM users WHERE id = ? AND role = 'teacher'"
        ).run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({
                error: "Teacher not found"
            });
        }

        res.json({
            success: true,
            message: "Teacher deleted successfully"
        });
    } catch (e) {
        res.status(500).json({
            error: "Failed to delete teacher"
        });
    }
});

app.put("/api/admin/teachers/:id", auth, admin, (req, res) => {
    const id = Number(req.params.id);

    const {
        name,
        email,
        phone,
        qualification,
        username
    } = req.body;

    try {
        const result = db.prepare(`
            UPDATE users
            SET
                name = ?,
                email = ?,
                phone = ?,
                qualification = ?,
                username = ?
            WHERE id = ? AND role = 'teacher'
        `).run(
            name,
            email,
            phone,
            qualification,
            username,
            id
        );

        if (result.changes === 0) {
            return res.status(404).json({
                error: "Teacher not found"
            });
        }

        res.json({
            success: true,
            message: "Teacher updated successfully"
        });
    } catch (e) {
        res.status(400).json({
            error: e.message
        });
    }
});
app.get("/api/my-fee-record", auth, (req, res) => {
  const record = db.prepare(`
    SELECT
      fee_records.total_fee,
      fee_records.paid_fee,
      fee_records.balance_fee,
      fee_records.last_payment_date,
      fee_records.transaction_id,
      fee_records.status,
      users.name,
      users.admission_no,
      users.class_name,
      users.section
    FROM fee_records
    LEFT JOIN users ON users.id = fee_records.student_id
    WHERE fee_records.student_id = ?
  `).get(req.user.id);

  if (!record) {
    return res.status(404).json({
      error: "Fee record not found"
    });
  }

  res.json(record);
});
app.post("/api/fee-payment", auth, (req, res) => {
  return res.status(403).json({
    error: "Direct fee updates are disabled. Submit a payment request for Admin verification."
  });
});
app.put("/api/admin/fee-records/:student_id", auth, admin, (req, res) => {
  const student_id = Number(req.params.student_id);
  const total_fee = Number(req.body.total_fee);

  if (!student_id || !Number.isFinite(total_fee) || total_fee < 0) {
    return res.status(400).json({
      error: "Valid student ID and total fee are required"
    });
  }

  const student = db.prepare(
    "SELECT id FROM users WHERE id=? AND role='student'"
  ).get(student_id);

  if (!student) {
    return res.status(404).json({
      error: "Student not found"
    });
  }

  const record = db.prepare(
    "SELECT paid_fee FROM fee_records WHERE student_id=?"
  ).get(student_id);

  if (record) {
    const paid_fee = Number(record.paid_fee || 0);
    const balance_fee = Math.max(0, total_fee - paid_fee);
    const status =
  paid_fee === 0
    ? "Pending"
    : balance_fee === 0
    ? "Paid"
    : "Partial";

    db.prepare(`
      UPDATE fee_records
      SET total_fee=?,
          balance_fee=?,
          status=?
      WHERE student_id=?
    `).run(
      total_fee,
      balance_fee,
      status,
      student_id
    );
  } else {
    db.prepare(`
      INSERT INTO fee_records
      (student_id, total_fee, paid_fee, balance_fee, status)
      VALUES (?, ?, 0, ?, 'Pending')
    `).run(
      student_id,
      total_fee,
      total_fee
    );
  }

  res.json({
    message: "Total fee updated successfully",
    total_fee: total_fee
  });
});
app.delete("/api/admin/fee-records/:student_id", auth, admin, (req, res) => {
  const student_id = Number(req.params.student_id);

  if (!student_id) {
    return res.status(400).json({
      error: "Valid student ID is required"
    });
  }

  const result = db.prepare(
    "DELETE FROM fee_records WHERE student_id=?"
  ).run(student_id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: "Fee record not found"
    });
  }

  res.json({
    success: true,
    message: "Fee record deleted successfully"
  });
});
app.get("/api/admin/fee-records", auth, admin, (req, res) => {
  const records = db.prepare(`
    SELECT
      fee_records.*,
      users.name,
      users.admission_no,
      users.class_name,
      users.section
    FROM fee_records
    LEFT JOIN users ON users.id = fee_records.student_id
    ORDER BY fee_records.id DESC
  `).all();

  res.json(records);
});
// Student submits school QR/UPI payment for verification
app.post("/api/fee-payment-request", auth, (req, res) => {
  const studentId = Number(req.user.id);
  const amount = Number(req.body.amount);
  const transactionId = String(req.body.transaction_id || "").trim();
  const method = String(req.body.payment_method || "UPI").toUpperCase();

  if (
    !studentId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !transactionId ||
    !["UPI", "QR"].includes(method)
  ) {
    return res.status(400).json({
      error: "Valid amount, UTR and payment method are required."
    });
  }

  const record = db.prepare(
    "SELECT * FROM fee_records WHERE student_id = ?"
  ).get(studentId);

  if (!record) {
    return res.status(404).json({
      error: "Fee record not found."
    });
  }

  if (amount > Number(record.balance_fee)) {
    return res.status(400).json({
      error: "Amount cannot exceed the remaining fee balance."
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO fee_payment_requests
      (student_id, amount, transaction_id, payment_method)
      VALUES (?, ?, ?, ?)
    `).run(studentId, amount, transactionId, method);

    res.status(201).json({
      message: "Payment request submitted. Waiting for Admin verification.",
      request_id: result.lastInsertRowid,
      status: "Pending"
    });
  } catch (error) {
    res.status(500).json({ error: "Could not submit payment request." });
  }
});

// Admin views payment requests
app.get("/api/admin/fee-payment-requests", auth, admin, (req, res) => {
  const requests = db.prepare(`
    SELECT r.id, r.student_id, r.amount, r.transaction_id,
           r.payment_method, r.status, r.created_at,
           u.name, u.admission_no, u.class_name, u.section
    FROM fee_payment_requests r
    LEFT JOIN users u ON u.id = r.student_id
    ORDER BY r.id DESC
  `).all();

  res.json(requests);
});

// Admin approves or rejects a request
app.patch("/api/admin/fee-payment-requests/:id", auth, admin, (req, res) => {
  const requestId = Number(req.params.id);
  const action = String(req.body.action || "").toLowerCase();

  if (!requestId || !["approve", "reject"].includes(action)) {
    return res.status(400).json({
      error: "Valid request ID and action are required."
    });
  }

  const approveRequest = db.transaction(() => {
    const request = db.prepare(`
      SELECT * FROM fee_payment_requests WHERE id = ?
    `).get(requestId);

    if (!request) throw new Error("Payment request not found.");
    if (request.status !== "Pending") {
      throw new Error("This request has already been reviewed.");
    }

    if (action === "reject") {
      db.prepare(`
        UPDATE fee_payment_requests
        SET status = 'Rejected', verified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(requestId);

      return { status: "Rejected" };
    }

    const fee = db.prepare(`
      SELECT * FROM fee_records WHERE student_id = ?
    `).get(request.student_id);

    if (!fee) throw new Error("Student fee record not found.");

    if (Number(request.amount) > Number(fee.balance_fee)) {
      throw new Error("Payment amount exceeds current fee balance.");
    }

    const paid = Number(fee.paid_fee) + Number(request.amount);
    const balance = Math.max(0, Number(fee.total_fee) - paid);
    const feeStatus = balance === 0 ? "Paid" : "Partial";

    db.prepare(`
      UPDATE fee_records
      SET paid_fee = ?, balance_fee = ?,
          last_payment_date = CURRENT_TIMESTAMP,
          transaction_id = ?, status = ?
      WHERE student_id = ?
    `).run(
      paid, balance, request.transaction_id, feeStatus,
      request.student_id
    );

    db.prepare(`
      UPDATE fee_payment_requests
      SET status = 'Approved', verified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(requestId);

    return { status: "Approved", paid_fee: paid, balance_fee: balance };
  });

  try {
    res.json(approveRequest());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("MICL running on http://localhost:"+ (process.env.PORT||3000)));
