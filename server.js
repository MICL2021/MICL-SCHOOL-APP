const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "micl.db"));
const SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_BEFORE_DEPLOYMENT";
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',class_name TEXT,section TEXT,admission_no TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY AUTOINCREMENT,day TEXT,period INTEGER,subject TEXT,teacher TEXT);
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,date TEXT,status TEXT,subject TEXT,FOREIGN KEY(student_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS homework(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,description TEXT,due_date TEXT);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,exam TEXT,subject TEXT,marks REAL,max_marks REAL,FOREIGN KEY(student_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,description TEXT,event_date TEXT);
CREATE TABLE IF NOT EXISTS gallery(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,image_url TEXT);
`);
const columns = [
  ["father_name", "TEXT"],
  ["mother_name", "TEXT"],
  ["phone", "TEXT"],
  ["address", "TEXT"],
  ["caste", "TEXT"],
  ["aadhaar_no", "TEXT"],
  ["apaar_no", "TEXT"],
  ["udise_pen", "TEXT"],
  ["username", "TEXT"]
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
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    section TEXT NOT NULL
  );
`);
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
db.prepare("UPDATE users SET password=? WHERE email=?").run(
  bcrypt.hashSync("Admin@123", 10),
  "admin@micl.edu"
);
app.post("/api/login",(req,res)=>{
const {email,password}=req.body;
const login=String(email||"").trim();
const u=db.prepare("SELECT * FROM users WHERE email=? OR admission_no=?").get(login,login);
if(!u||!bcrypt.compareSync(password||"",u.password))return res.status(401).json({error:"Invalid username/email or password"});
const token=jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"7d"});
res.json({token,user:{id:u.id,name:u.name,email:u.email,role:u.role,class_name:u.class_name,section:u.section,admission_no:u.admission_no}});
});
function auth(req,res,next){try{const h=req.headers.authorization||"";req.user=jwt.verify(h.replace("Bearer ",""),SECRET);next()}catch(e){res.status(401).json({error:"Unauthorized"})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin access required"});next()}

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
app.get("/api/me",auth,(req,res)=>res.json(db.prepare("SELECT id,name,email,role,class_name,section,admission_no FROM users WHERE id=?").get(req.user.id)));
app.get("/api/notices",auth,(req,res)=>res.json(db.prepare("SELECT * FROM notices ORDER BY id DESC").all()));
app.get("/api/timetable",auth,(req,res)=>res.json(db.prepare("SELECT * FROM timetable ORDER BY CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END,period").all()));
app.get("/api/homework",auth,(req,res)=>res.json(db.prepare("SELECT * FROM homework ORDER BY due_date").all()));
app.get("/api/events",auth,(req,res)=>res.json(db.prepare("SELECT * FROM events ORDER BY event_date").all()));
app.get("/api/gallery",auth,(req,res)=>res.json(db.prepare("SELECT * FROM gallery ORDER BY id DESC").all()));
app.get("/api/attendance",auth,(req,res)=>res.json(db.prepare("SELECT date,status,subject FROM attendance WHERE student_id=? ORDER BY date DESC").all(req.user.id)));
app.get("/api/results",auth,(req,res)=>res.json(db.prepare("SELECT exam,subject,marks,max_marks FROM results WHERE student_id=? ORDER BY id DESC").all(req.user.id)));

app.post("/api/admin/notices",auth,admin,(req,res)=>{const {title,body}=req.body;const r=db.prepare("INSERT INTO notices(title,body) VALUES(?,?)").run(title,body);res.json({id:r.lastInsertRowid})});
app.post("/api/admin/homework",auth,admin,(req,res)=>{const {title,description,due_date}=req.body;const r=db.prepare("INSERT INTO homework(title,description,due_date) VALUES(?,?,?)").run(title,description,due_date);res.json({id:r.lastInsertRowid})});
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
    phone,
    qualification,
    username
  }=req.body;

  try{
    const r=db.prepare(
      "INSERT INTO users(name,email,password,role,class_name,section,admission_no,phone,qualification,username) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).run(
      name,
      email,
      bcrypt.hashSync(password,10),
      role||"student",
      class_name,
      section,
      admission_no,
      phone,
      qualification,
      username
    );

    res.json({id:r.lastInsertRowid});
  }catch(e){
    res.status(400).json({
      error:e.message
    });
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
    SELECT id, name, email, phone, qualification
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
      return res.status(404).json({ error: "Teacher not found" });
    }

    res.json({ success: true, message: "Teacher deleted successfully" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete teacher" });
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
  const { student_id, amount, transaction_id } = req.body;

  const fee = Number(amount);

  if (!student_id || !fee || fee <= 0 || !transaction_id) {
    return res.status(400).json({
      error: "Student ID, amount and transaction ID are required"
    });
  }

  const record = db.prepare(`
    SELECT * FROM fee_records
    WHERE student_id = ?
  `).get(student_id);

  if (!record) {
    return res.status(404).json({
      error: "Fee record not found for this student"
    });
  }

  const newPaid = Number(record.paid_fee) + fee;
  const newBalance = Math.max(0, Number(record.total_fee) - newPaid);

  const status = newBalance === 0 ? "Paid" : "Partial";

  db.prepare(`
    UPDATE fee_records
    SET paid_fee = ?,
        balance_fee = ?,
        last_payment_date = datetime('now'),
        transaction_id = ?,
        status = ?
    WHERE student_id = ?
  `).run(
    newPaid,
    newBalance,
    transaction_id,
    status,
    student_id
  );

  res.json({
    message: "Fee payment recorded successfully",
    total_fee: record.total_fee,
    paid_fee: newPaid,
    balance_fee: newBalance,
    status: status
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
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("MICL running on http://localhost:"+ (process.env.PORT||3000)));
