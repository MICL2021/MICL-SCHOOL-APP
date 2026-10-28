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

const omrUpload = multer({
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

async function uploadOMRFile(file) {
  if (!file) return null;

  const isPdf = file.mimetype === "application/pdf";

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "micl-omr-scans",
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
async function uploadIdCardImage(file) {
  if (!file) return null;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    throw new Error("Only JPG, PNG or WEBP images allowed");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Maximum image size is 5 MB");
  }

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "micl-id-card-assets",
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

db.exec(`
  CREATE TABLE IF NOT EXISTS formative_summative_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    f1 REAL NOT NULL DEFAULT 0,
    f2 REAL NOT NULL DEFAULT 0,
    f3 REAL NOT NULL DEFAULT 0,
    f4 REAL NOT NULL DEFAULT 0,
    f5 REAL NOT NULL DEFAULT 0,
    f6 REAL NOT NULL DEFAULT 0,
    co_curricular REAL NOT NULL DEFAULT 0,
    summative REAL NOT NULL DEFAULT 0,
    academic_year TEXT NOT NULL,
    UNIQUE(student_id, subject, academic_year),
    FOREIGN KEY(student_id) REFERENCES users(id)
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
  CREATE TABLE IF NOT EXISTS id_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_role TEXT NOT NULL CHECK(user_role IN ('student', 'teacher')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, user_role)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS id_card_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    school_stamp TEXT DEFAULT '',
    digital_signature TEXT DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const idCardSettingsColumns = [
  ["class_teacher_signature", "TEXT DEFAULT ''"],
  ["checked_by_signature", "TEXT DEFAULT ''"],
  ["principal_signature", "TEXT DEFAULT ''"]
];

for (const [column, definition] of idCardSettingsColumns) {
  const columns = db.prepare("PRAGMA table_info(id_card_settings)").all();

  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE id_card_settings ADD COLUMN ${column} ${definition}`);
  }
}

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

db.exec(`
  CREATE TABLE IF NOT EXISTS omr_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    marks_per_question REAL NOT NULL DEFAULT 1,
    negative_marks REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS omr_answer_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    question_no INTEGER NOT NULL,
    correct_answer TEXT NOT NULL,
    UNIQUE(exam_id, question_no),
    FOREIGN KEY(exam_id) REFERENCES omr_exams(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS omr_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    file_url TEXT DEFAULT '',
    answers_json TEXT NOT NULL DEFAULT '{}',
    score REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending Review',
    reviewed_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES omr_exams(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
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

app.get("/api/admin/id-cards", auth, admin, (req, res) => {
  try {
    const cards = db.prepare(`
      SELECT c.id, c.user_id, c.user_role,
             c.created_at, c.updated_at,
             u.name, u.email, u.phone, u.photo,
             u.admission_no, u.roll_no, u.class_name,
             u.section, u.dob, u.username, u.qualification,
             u.designation, u.school_name
      FROM id_cards c
      JOIN users u ON u.id = c.user_id
      WHERE u.role = c.user_role
      ORDER BY c.updated_at DESC
    `).all();

    res.json(cards);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load ID cards" });
  }
});

app.post("/api/admin/id-cards", auth, admin, (req, res) => {
  const userId = Number(req.body.user_id);
  const role = req.body.user_role;

  if (!Number.isInteger(userId) || userId < 1 ||
      !["student", "teacher"].includes(role)) {
    return res.status(400).json({ error: "Invalid account or role" });
  }

  try {
    const user = db.prepare(
      "SELECT id FROM users WHERE id = ? AND role = ?"
    ).get(userId, role);

    if (!user) {
      return res.status(404).json({ error: "Account not found" });
    }

    db.prepare(`
      INSERT INTO id_cards (user_id, user_role)
      VALUES (?, ?)
      ON CONFLICT(user_id, user_role)
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `).run(userId, role);

    const card = db.prepare(`
      SELECT id, user_id, user_role, created_at, updated_at
      FROM id_cards WHERE user_id = ? AND user_role = ?
    `).get(userId, role);

    res.json({ success: true, card });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save ID card record" });
  }
});

app.delete("/api/admin/id-cards/:id", auth, admin, (req, res) => {
  try {
    const result = db.prepare(
      "DELETE FROM id_cards WHERE id = ?"
    ).run(Number(req.params.id));

    if (!result.changes) {
      return res.status(404).json({ error: "ID card record not found" });
    }

    res.json({ success: true, message: "ID card record deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete ID card record" });
  }
});

app.post("/api/admin/omr/exams", auth, admin, (req, res) => {
  try {
    const {
      exam_name,
      class_name,
      subject,
      total_questions,
      marks_per_question,
      negative_marks
    } = req.body;

    if (
      !exam_name ||
      !class_name ||
      !subject ||
      !Number.isInteger(Number(total_questions)) ||
      Number(total_questions) < 1 ||
      !Number.isFinite(Number(marks_per_question)) ||
      Number(marks_per_question) <= 0 ||
      !Number.isFinite(Number(negative_marks)) ||
      Number(negative_marks) < 0
    ) {
      return res.status(400).json({
        error: "Please enter valid exam details"
      });
    }

    const result = db.prepare(`
      INSERT INTO omr_exams
      (exam_name, class_name, subject, total_questions,
       marks_per_question, negative_marks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      String(exam_name).trim(),
      String(class_name).trim(),
      String(subject).trim(),
      Number(total_questions),
      Number(marks_per_question),
      Number(negative_marks)
    );

    res.status(201).json({
      success: true,
      exam_id: result.lastInsertRowid,
      message: "OMR exam created successfully"
    });
  } catch (error) {
    console.error("OMR exam creation error:", error);
    res.status(500).json({
      error: "Could not create OMR exam"
    });
  }
});

app.get("/api/admin/omr/exams", auth, admin, (req, res) => {
  try {
    const exams = db.prepare(`
      SELECT id, exam_name, class_name, subject,
             total_questions, marks_per_question,
             negative_marks, created_at
      FROM omr_exams
      ORDER BY id DESC
    `).all();

    res.json(exams);
  } catch (error) {
    console.error("OMR exam list error:", error);
    res.status(500).json({
      error: "Could not load OMR exams"
    });
  }
});

app.post("/api/admin/omr/exams/:id/answer-key", auth, admin, (req, res) => {
  try {
    const examId = Number(req.params.id);
    const answers = req.body.answers;

    if (!Number.isInteger(examId) || examId < 1) {
      return res.status(400).json({ error: "Invalid exam ID" });
    }

    const exam = db.prepare(
      "SELECT id, total_questions FROM omr_exams WHERE id = ?"
    ).get(examId);

    if (!exam) {
      return res.status(404).json({ error: "OMR exam not found" });
    }

    if (!Array.isArray(answers) || answers.length !== exam.total_questions) {
      return res.status(400).json({
        error: "Please provide one answer for every question"
      });
    }

    const validAnswers = answers.every((item, index) =>
      item &&
      Number(item.question_no) === index + 1 &&
      ["A", "B", "C", "D"].includes(
        String(item.correct_answer).toUpperCase()
      )
    );

    if (!validAnswers) {
      return res.status(400).json({
        error: "Answers must be A, B, C or D for every question"
      });
    }

    const saveAnswers = db.transaction(() => {
      const insert = db.prepare(`
  INSERT INTO omr_answer_keys
  (exam_id, question_no, correct_answer)
  VALUES (?, ?, ?)
  ON CONFLICT(exam_id, question_no)
  DO UPDATE SET correct_answer = excluded.correct_answer
`);
      answers.forEach(item => {
        insert.run(
          examId,
          Number(item.question_no),
          String(item.correct_answer).toUpperCase()
        );
      });
    });

    saveAnswers();

    res.json({
      success: true,
      message: "OMR answer key saved successfully"
    });
  } catch (error) {
    console.error("OMR answer key error:", error);
    res.status(500).json({
      error: "Could not save OMR answer key"
    });
  }
});

app.get("/api/admin/omr/exams/:id/answer-key", auth, admin, (req, res) => {
  try {
    const examId = Number(req.params.id);

    if (!Number.isInteger(examId) || examId < 1) {
      return res.status(400).json({ error: "Invalid exam ID" });
    }

    const exam = db.prepare(
      "SELECT id, total_questions FROM omr_exams WHERE id = ?"
    ).get(examId);

    if (!exam) {
      return res.status(404).json({ error: "OMR exam not found" });
    }

    const answers = db.prepare(`
      SELECT question_no, correct_answer
      FROM omr_answer_keys
      WHERE exam_id = ?
      ORDER BY question_no
    `).all(examId);

    res.json({
      exam_id: exam.id,
      total_questions: exam.total_questions,
      answers
    });
  } catch (error) {
    console.error("OMR answer key read error:", error);
    res.status(500).json({
      error: "Could not load OMR answer key"
    });
  }
});

app.post("/api/admin/omr/exams/:id/submissions", auth, admin, omrUpload.single("omrFile"), async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const studentId = Number(req.body.student_id);
    const answers = req.body.answers;
    if (!Number.isInteger(examId) || examId < 1) {
      return res.status(400).json({ error: "Invalid exam ID" });
    }

    if (!Number.isInteger(studentId) || studentId < 1) {
      return res.status(400).json({ error: "Invalid student ID" });
    }

    const exam = db.prepare(
      "SELECT id, total_questions FROM omr_exams WHERE id = ?"
    ).get(examId);

    if (!exam) {
      return res.status(404).json({ error: "OMR exam not found" });
    }

    const student = db.prepare(
      "SELECT id FROM users WHERE id = ? AND role = 'student'"
    ).get(studentId);

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an object" });
    }
const uploadedFile = await uploadOMRFile(req.file);

const result = db.prepare(`
  INSERT INTO omr_submissions
  (exam_id, student_id, file_url, answers_json, status)
  VALUES (?, ?, ?, ?, 'Pending Review')
`).run(
  examId,
  studentId,
  uploadedFile ? uploadedFile.url : '',
  JSON.stringify(answers)
);
    res.status(201).json({
      success: true,
      submission_id: result.lastInsertRowid,
      status: "Pending Review"
    });
  } catch (error) {
    console.error("OMR submission error:", error);
    res.status(500).json({
      error: "Could not save OMR submission"
    });
  }
});

app.get("/api/admin/omr/exams/:id/submissions", auth, admin, (req, res) => {
  try {
    const examId = Number(req.params.id);

    if (!Number.isInteger(examId) || examId < 1) {
      return res.status(400).json({ error: "Invalid exam ID" });
    }

    const exam = db.prepare(
      "SELECT id FROM omr_exams WHERE id = ?"
    ).get(examId);

    if (!exam) {
      return res.status(404).json({ error: "OMR exam not found" });
    }

    const submissions = db.prepare(`
      SELECT
        s.id,
        s.exam_id,
        s.student_id,
        u.name AS student_name,
        u.admission_no,
        s.file_url,
        s.answers_json,
        s.score,
        s.status,
        s.created_at
      FROM omr_submissions s
      JOIN users u ON u.id = s.student_id
      WHERE s.exam_id = ?
      ORDER BY s.id DESC
    `).all(examId);

    res.json(submissions);
  } catch (error) {
    console.error("OMR submissions list error:", error);
    res.status(500).json({
      error: "Could not load OMR submissions"
    });
  }
});

app.put("/api/admin/omr/submissions/:id/review", auth, admin, (req, res) => {
  try {
    const submissionId = Number(req.params.id);
    const answers = req.body.answers;

    if (!Number.isInteger(submissionId) || submissionId < 1) {
      return res.status(400).json({ error: "Invalid submission ID" });
    }

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an object" });
    }

    const submission = db.prepare(`
      SELECT s.id, s.exam_id, s.student_id, e.total_questions,
             e.marks_per_question, e.negative_marks
      FROM omr_submissions s
      JOIN omr_exams e ON e.id = s.exam_id
      WHERE s.id = ?
    `).get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const answerKey = db.prepare(`
      SELECT question_no, correct_answer
      FROM omr_answer_keys
      WHERE exam_id = ?
    `).all(submission.exam_id);

    if (answerKey.length !== submission.total_questions) {
      return res.status(400).json({
        error: "Complete the answer key before reviewing"
      });
    }

    let score = 0;
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    for (let q = 1; q <= submission.total_questions; q++) {
      const given = String(answers[q] || "").trim().toUpperCase();
      const key = answerKey.find(a => a.question_no === q);

      if (!["A", "B", "C", "D"].includes(given)) {
        unanswered++;
      } else if (given === key.correct_answer) {
        correct++;
        score += submission.marks_per_question;
      } else {
        wrong++;
        score -= submission.negative_marks;
      }
    }

    score = Math.max(0, Number(score.toFixed(2)));

    db.prepare(`
      UPDATE omr_submissions
      SET answers_json = ?, score = ?, status = 'Reviewed', reviewed_by = ?
      WHERE id = ?
    `).run(
      JSON.stringify(answers),
      score,
      req.user.id,
      submissionId
    );

    res.json({
      success: true,
      submission_id: submissionId,
      correct,
      wrong,
      unanswered,
      score,
      max_marks: submission.total_questions * submission.marks_per_question,
      status: "Reviewed"
    });
  } catch (error) {
    console.error("OMR review error:", error);
    res.status(500).json({
      error: "Could not review OMR submission"
    });
  }
});

app.get("/api/admin/id-card-settings", auth, admin, (req, res) => {
  try {
    const settings = db.prepare(`
  SELECT school_stamp, digital_signature,
         class_teacher_signature, checked_by_signature,
         principal_signature, updated_at
  FROM id_card_settings WHERE id = 1
`).get();

    res.json(settings || {
      school_stamp: "",
      digital_signature: "",
      principal_signature: "",
      class_teacher_signature: "",
      checked_by_signature: ""
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load ID card settings" });
  }
});


app.post(
  "/api/admin/id-card-settings/:type",
  auth,
  admin,
  noticeUpload.single("image"),
  async (req, res) => {
    try {
      const type = req.params.type;

      if (!["stamp", "signature", "principal-signature", "class-teacher-signature", "checked-by-signature"].includes(type)) {
        return res.status(400).json({ error: "Invalid image type" });
      }

      let imageUrl = "";

      if (req.file) {
        imageUrl = await uploadIdCardImage(req.file);
      } else if (
        typeof req.body.image_data === "string" &&
        /^data:image\/(png|jpeg|webp);base64,/.test(req.body.image_data)
      ) {
        const uploaded = await cloudinary.uploader.upload(
          req.body.image_data,
          {
            folder: "micl-id-card-settings",
            resource_type: "image"
          }
        );
        imageUrl = uploaded.secure_url;
      } else {
        return res.status(400).json({
          error: "Please upload an image or draw a signature"
        });
      }

      
const allowedColumns = {
  stamp: "school_stamp",
  signature: "digital_signature",
  "principal-signature": "principal_signature",
  "class-teacher-signature": "class_teacher_signature",
  "checked-by-signature": "checked_by_signature"
};

const column = allowedColumns[type];

if (!column) {
  return res.status(400).json({ error: "Invalid image type" });
}

db.prepare(`
  INSERT INTO id_card_settings (
  id, school_stamp, digital_signature,
  class_teacher_signature, checked_by_signature,
  principal_signature
)
VALUES (1, '', '', '', '', '')
    
  ON CONFLICT(id) DO NOTHING
`).run();

db.prepare(`
  UPDATE id_card_settings
  SET ${column} = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`).run(imageUrl);


      res.json({
        success: true,
        image_url: imageUrl,
        message: "ID card image saved successfully"
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Could not save stamp or signature"
      });
    }
  }
);

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

app.put("/api/admin/subjects/:id", auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();

  if (!Number.isInteger(id) || id < 1 || !name) {
    return res.status(400).json({
      error: "Valid subject ID aur name enter karein."
    });
  }

  try {
    const result = db.prepare(
      "UPDATE subjects SET name = ? WHERE id = ?"
    ).run(name, id);

    if (!result.changes) {
      return res.status(404).json({
        error: "Subject nahi mila."
      });
    }

    res.json({
      success: true,
      message: "Subject update ho gaya."
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "Yeh subject pehle se maujood hai."
      });
    }

    res.status(500).json({
      error: "Subject update nahi ho saka."
    });
  }
});

app.delete("/api/admin/subjects/:id", auth, admin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Invalid subject ID."
    });
  }

  try {
    const result = db.prepare(
      "DELETE FROM subjects WHERE id = ?"
    ).run(id);

    if (!result.changes) {
      return res.status(404).json({
        error: "Subject nahi mila."
      });
    }

    res.json({
      success: true,
      message: "Subject delete ho gaya."
    });
  } catch (error) {
    res.status(500).json({
      error: "Subject delete nahi ho saka."
    });
  }
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
const {email,username,password,role}=req.body;
const login=String(username || email || "").trim();
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
     SELECT id,name,email,admission_no,class_name,section,roll_no,exam_roll_no,father_name,mother_name,dob,address,caste,aadhaar_no,udise_pen,apaar_no,phone,photo
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
  try {
    const classes = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.section,
        (
          SELECT COUNT(*)
          FROM users u
          WHERE u.role = 'student'
            AND TRIM(u.class_name) = TRIM(c.name)
            AND TRIM(u.section) = TRIM(c.section)
        ) AS student_count
      FROM classes c
      ORDER BY c.id DESC
    `).all();

    res.json(classes);
  } catch (error) {
    console.error("Load classes error:", error);
    res.status(500).json({
      error: "Could not load classes"
    });
  }
});

app.delete("/api/admin/classes/:id", auth, admin, (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid class ID"
      });
    }

    const cls = db.prepare(
      "SELECT name, section FROM classes WHERE id = ?"
    ).get(id);

    if (!cls) {
      return res.status(404).json({
        error: "Class not found"
      });
    }

    const students = db.prepare(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE role = 'student'
        AND TRIM(class_name) = TRIM(?)
        AND TRIM(section) = TRIM(?)
    `).get(cls.name, cls.section);

    if (students.total > 0) {
      return res.status(409).json({
        error: `This class has ${students.total} student(s). Move students to another class/section before deleting. Student records are safe.`
      });
    }

    db.prepare(
      "DELETE FROM classes WHERE id = ?"
    ).run(id);

    return res.json({
      success: true,
      message: "Class deleted successfully"
    });

  } catch (error) {
    console.error("Delete class error:", error);
    return res.status(500).json({
      error: "Could not delete class"
    });
  }
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

app.post("/api/admin/classes/promote", auth, admin, (req, res) => {
  try {
    const { fromClass, fromSection, toClass, toSection } = req.body;

    if (!fromClass || !fromSection || !toClass || !toSection) {
      return res.status(400).json({
        error: "Please select source and destination class/section"
      });
    }

    if (
      fromClass.trim() === toClass.trim() &&
      fromSection.trim() === toSection.trim()
    ) {
      return res.status(400).json({
        error: "Source and destination must be different"
      });
    }

    const destination = db.prepare(`
      SELECT id FROM classes
      WHERE TRIM(name) = TRIM(?)
      AND TRIM(section) = TRIM(?)
    `).get(toClass, toSection);

    if (!destination) {
      return res.status(400).json({
        error: "Please add the destination class/section first"
      });
    }

    const result = db.prepare(`
      UPDATE users
      SET class_name = ?, section = ?
      WHERE role = 'student'
      AND TRIM(class_name) = TRIM(?)
      AND TRIM(section) = TRIM(?)
    `).run(
      toClass.trim(),
      toSection.trim(),
      fromClass.trim(),
      fromSection.trim()
    );

    return res.json({
      success: true,
      promoted: result.changes,
      message: `${result.changes} student(s) promoted successfully`
    });

  } catch (error) {
    console.error("Class promotion error:", error);
    return res.status(500).json({
      error: "Could not promote students"
    });
  }
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

app.get("/api/admin/teachers", auth, admin, (req, res) => {
  const teachers = db.prepare(`
    SELECT id, name, email, phone, qualification, photo, username, class_name, section, designation, school_name
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

app.get("/api/teacher/marksheet/students", auth, teacherOnly, (req, res) => {
  const teacher = db.prepare(
    "SELECT class_name, section FROM users WHERE id=? AND role='teacher'"
  ).get(req.user.id);

  if (!teacher || !teacher.class_name || !teacher.section) {
    return res.status(400).json({
      error: "No class assigned to this teacher"
    });
  }

  const students = db.prepare(`
    SELECT id, name, admission_no, class_name, section, roll_no, exam_roll_no
    FROM users
    WHERE role='student' AND class_name=? AND section=?
    ORDER BY name
  `).all(teacher.class_name, teacher.section);

  res.json(students);
});

app.post("/api/teacher/marksheet/marks", auth, teacherOnly, (req, res) => {
  const { student_id, exam, subject, marks, max_marks } = req.body;
  const studentId = Number(student_id);
  const mark = Number(marks);
  const max = Number(max_marks);
  const term = String(exam || "");
  const sub = String(subject || "").trim();

  if (
    !Number.isInteger(studentId) || studentId < 1 ||
    !["Term 1", "Term 2", "Annual"].includes(term) ||
    !sub || !Number.isFinite(mark) || !Number.isFinite(max) ||
    max <= 0 || mark < 0 || mark > max
  ) {
    return res.status(400).json({
      error: "Please enter valid subject and marks."
    });
  }

  const teacher = db.prepare(
    "SELECT class_name, section FROM users WHERE id=? AND role='teacher'"
  ).get(req.user.id);

  const student = db.prepare(
    "SELECT id FROM users WHERE id=? AND role='student' AND class_name=? AND section=?"
  ).get(studentId, teacher?.class_name, teacher?.section);

  if (!student) {
    return res.status(403).json({
      error: "Student is not in your assigned class."
    });
  }

  const existing = db.prepare(
    "SELECT id FROM results WHERE student_id=? AND exam=? AND subject=?"
  ).get(studentId, term, sub);

  if (existing) {
    db.prepare(
      "UPDATE results SET marks=?, max_marks=? WHERE id=?"
    ).run(mark, max, existing.id);
  } else {
    db.prepare(
      "INSERT INTO results(student_id,exam,subject,marks,max_marks) VALUES(?,?,?,?,?)"
    ).run(studentId, term, sub, mark, max);
  }

  res.json({ success: true, message: "Marks saved successfully." });
});

app.get("/api/admin/marksheet/students", auth, admin, (req, res) => {
  const students = db.prepare(`
    SELECT id, name, admission_no, class_name, section, roll_no, exam_roll_no
    FROM users
    WHERE role='student'
    ORDER BY class_name, section, name
  `).all();

  res.json(students);
});

app.get("/api/admin/marksheet", auth, admin, (req, res) => {
  const studentId = Number(req.query.student_id);
  const exam = String(req.query.exam || "");
const subject = String(req.query.subject || "").trim();

if (!subject) {
  return res.status(400).json({
    error: "Pehle subject select karein."
  });
}
  if (
    !Number.isInteger(studentId) || studentId < 1 ||
    !["Term 1", "Term 2", "Annual"].includes(exam)
  ) {
    return res.status(400).json({
      error: "Select a student and term."
    });
  }

  const student = db.prepare(`
    SELECT id, name, admission_no, class_name, section, roll_no,
           exam_roll_no, father_name, photo
    FROM users
    WHERE id=? AND role='student'
  `).get(studentId);

  if (!student) {
    return res.status(404).json({ error: "Student not found." });
  }
const records = db.prepare(`
  SELECT subject, marks, max_marks
  FROM results
  WHERE student_id=? AND exam=? AND subject=?
  ORDER BY subject
`).all(studentId, exam, subject);
  res.json({ student, exam, records });
});
app.post("/api/admin/marksheet/marks", auth, admin, (req, res) => {
  const studentId = Number(req.body.student_id);
  const exam = String(req.body.exam || "");
  const subject = String(req.body.subject || "").trim();
  const marks = Number(req.body.marks);
  const maxMarks = Number(req.body.max_marks);

  if (
    !Number.isInteger(studentId) ||
    studentId < 1 ||
    !["Term 1", "Term 2", "Annual"].includes(exam) ||
    !subject ||
    req.body.marks === "" ||
    req.body.max_marks === "" ||
    !Number.isFinite(marks) ||
    !Number.isFinite(maxMarks) ||
    maxMarks <= 0 ||
    marks < 0 ||
    marks > maxMarks
  ) {
    return res.status(400).json({
      error: "Student, term, subject aur valid marks enter karein."
    });
  }

  const student = db.prepare(
    "SELECT id FROM users WHERE id=? AND role='student'"
  ).get(studentId);

  if (!student) {
    return res.status(404).json({
      error: "Student nahi mila."
    });
  }

  const existing = db.prepare(
    "SELECT id FROM results WHERE student_id=? AND exam=? AND subject=?"
  ).get(studentId, exam, subject);

  if (existing) {
    db.prepare(
      "UPDATE results SET marks=?, max_marks=? WHERE id=?"
    ).run(marks, maxMarks, existing.id);
  } else {
    db.prepare(
      "INSERT INTO results (student_id, exam, subject, marks, max_marks) VALUES (?, ?, ?, ?, ?)"
    ).run(studentId, exam, subject, marks, maxMarks);
  }

  res.json({
    success: true,
    message: "Marks save/update ho gaye."
  });
});

app.post("/api/admin/formative-summative-marks", auth, admin, (req, res) => {
  const {
    student_id,
    subject,
    f1, f2, f3, f4, f5, f6,
    co_curricular,
    summative,
    academic_year
  } = req.body;

  const studentId = Number(student_id);
  const subjectName = String(subject || "").trim();
  const year = String(academic_year || "2026-2027").trim();

  const values = [
    f1, f2, f3, f4, f5, f6,
    co_curricular, summative
  ].map(Number);

  if (!Number.isInteger(studentId) || studentId < 1 || !subjectName || !year) {
    return res.status(400).json({
      error: "Student, subject aur academic year select karein."
    });
  }

  if (values.some(v => !Number.isFinite(v) || v < 0)) {
    return res.status(400).json({
      error: "Marks valid aur zero ya us se zyada hone chahiye."
    });
  }

  const [a, b, c, d, e, f, co, sum] = values;

  if (
    a > 5 || b > 5 || c > 5 || d > 5 || e > 5 || f > 5 ||
    co > 20 || sum > 50
  ) {
    return res.status(400).json({
      error: "F1-F6 har ek 5, Co-curricular 20 aur Summative 50 marks tak hain."
    });
  }

  const student = db.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'student'"
  ).get(studentId);

  if (!student) {
    return res.status(404).json({ error: "Student nahi mila." });
  }

  try {
    db.prepare(`
      INSERT INTO formative_summative_marks
      (student_id, subject, f1, f2, f3, f4, f5, f6,
       co_curricular, summative, academic_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, subject, academic_year)
      DO UPDATE SET
        f1=excluded.f1,
        f2=excluded.f2,
        f3=excluded.f3,
        f4=excluded.f4,
        f5=excluded.f5,
        f6=excluded.f6,
        co_curricular=excluded.co_curricular,
        summative=excluded.summative
    `).run(studentId, subjectName, a, b, c, d, e, f, co, sum, year);

    res.json({
      success: true,
      message: "Formative aur Summative marks save ho gaye.",
      formative_total: a + b + c + d + e + f,
      total: a + b + c + d + e + f + co + sum,
      maximum: 100
    });
  } catch (error) {
    res.status(500).json({ error: "Marks save nahi ho sake." });
  }
});
// GET Formative & Summative marks for Admin
app.get("/api/admin/formative-summative-marks", auth, admin, (req, res) => {
  const studentId = Number(req.query.student_id);
  const year = String(req.query.academic_year || "2026-2027").trim();

  if (!Number.isInteger(studentId) || studentId < 1) {
    return res.status(400).json({ error: "Please select a student." });
  }

  try {
    const student = db.prepare(`
      SELECT id, name, admission_no, class_name, section, roll_no,
             father_name, photo
      FROM users
      WHERE id = ? AND role = 'student'
    `).get(studentId);

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const records = db.prepare(`
      SELECT subject, f1, f2, f3, f4, f5, f6,
             co_curricular, summative, academic_year
      FROM formative_summative_marks
      WHERE student_id = ? AND academic_year = ?
      ORDER BY subject
    `).all(studentId, year);

    res.json({ student, academic_year: year, records });
  } catch (error) {
    console.error("Formative marks load error:", error);
    res.status(500).json({ error: "Marks load nahi ho sake." });
  }
});
app.get("/api/marksheet", auth, (req, res) => {
  const exam = String(req.query.exam || "");

  if (!["Term 1", "Term 2", "Annual"].includes(exam)) {
    return res.status(400).json({
      error: "Select a valid term."
    });
  }

  const student = db.prepare(`
    SELECT id, name, admission_no, class_name, section, roll_no,
           exam_roll_no, father_name, photo
    FROM users
    WHERE id=? AND role='student'
  `).get(req.user.id);

  if (!student) {
    return res.status(403).json({
      error: "Student account required."
    });
  }
  const records = db.prepare(`
    SELECT subject, marks, max_marks
    FROM results
    WHERE student_id=? AND exam=?
    ORDER BY subject
  `).all(student.id, exam);

  res.json({ student, exam, records });
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("MICL running on http://localhost:"+ (process.env.PORT||3000)));
