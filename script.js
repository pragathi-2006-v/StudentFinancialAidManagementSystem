const API = "http://localhost:5000/api";
let currentStudent = null;
let allSchemes = [];

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  if (id === "schemes") loadSchemes();
  if (id === "studentDashboard" && currentStudent) loadStudentDashboard();
  if (id === "admin") loadAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setMessage(id, text, success = true) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.style.color = success ? "#217a4a" : "#b13b3b";
}

// REGISTER
document.getElementById("registerForm").addEventListener("submit", async e => {
  e.preventDefault();

  const data = {
    name: regName.value.trim(),
    studentId: regStudentId.value.trim(),
    email: regEmail.value.trim(),
    password: regPassword.value,
    department: regDepartment.value.trim(),
    year: regYear.value,
    phone: regPhone.value.trim(),
    familyIncome: Number(regIncome.value) || 0
  };

  const res = await fetch(`${API}/students/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  setMessage("registerMessage", result.message, res.ok);

  if (res.ok) {
    document.getElementById("registerForm").reset();
    setTimeout(() => showSection("login"), 900);
  }
});

// LOGIN
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const res = await fetch(`${API}/students/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    })
  });

  const result = await res.json();
  setMessage("loginMessage", result.message, res.ok);

  if (res.ok) {
    currentStudent = result.student;
    showSection("studentDashboard");
  }
});

// SCHEMES
async function loadSchemes() {
  const res = await fetch(`${API}/aid-schemes`);
  allSchemes = await res.json();
  renderSchemes(allSchemes, "schemeList", false);
}

function renderSchemes(schemes, containerId, studentMode) {
  const container = document.getElementById(containerId);

  if (!schemes.length) {
    container.innerHTML = `<div class="empty">No financial aid schemes available.</div>`;
    return;
  }

  container.innerHTML = schemes.map(s => `
    <article class="scheme-card">
      <span class="tag">Financial Aid</span>
      <h3>${escapeHtml(s.name)}</h3>
      <div class="amount">₹${Number(s.amount).toLocaleString("en-IN")}</div>
      <p><strong>Eligibility:</strong> ${escapeHtml(s.eligibility || "Not specified")}</p>
      <p><strong>Documents:</strong> ${escapeHtml(s.requiredDocuments || "Not specified")}</p>
      <p><strong>Deadline:</strong> ${escapeHtml(s.deadline || "Not specified")}</p>
      <p>${escapeHtml(s.description || "")}</p>
      ${studentMode ? `<button class="btn primary apply" onclick="applyForScheme('${s._id}')">Apply Now</button>` : ""}
    </article>
  `).join("");
}

function filterSchemes() {
  const term = document.getElementById("schemeSearch").value.toLowerCase();
  renderSchemes(
    allSchemes.filter(s => (s.name + " " + (s.description || "")).toLowerCase().includes(term)),
    "schemeList",
    false
  );
}

// STUDENT DASHBOARD
async function loadStudentDashboard() {
  document.getElementById("studentWelcome").textContent = `Welcome, ${currentStudent.name}`;
  document.getElementById("studentInfo").innerHTML = `
    <div class="profile-item"><span>Student ID</span><strong>${escapeHtml(currentStudent.studentId)}</strong></div>
    <div class="profile-item"><span>Department</span><strong>${escapeHtml(currentStudent.department || "-")}</strong></div>
    <div class="profile-item"><span>Year</span><strong>${escapeHtml(currentStudent.year || "-")}</strong></div>
    <div class="profile-item"><span>Family Income</span><strong>₹${Number(currentStudent.familyIncome || 0).toLocaleString("en-IN")}</strong></div>
  `;

  const res = await fetch(`${API}/aid-schemes`);
  allSchemes = await res.json();
  renderSchemes(allSchemes, "studentSchemes", true);

  const appRes = await fetch(`${API}/applications/student/${currentStudent.studentId}`);
  const apps = await appRes.json();
  renderStudentApplications(apps);
}

function renderStudentApplications(apps) {
  const box = document.getElementById("myApplications");

  if (!apps.length) {
    box.innerHTML = `<div class="empty">You have not submitted any applications yet.</div>`;
    return;
  }

  box.innerHTML = `<div class="panel table-wrap"><table>
    <tr><th>Scheme</th><th>Submitted</th><th>Document</th><th>Status</th><th>Remarks</th></tr>
    ${apps.map(a => `
      <tr>
        <td>${escapeHtml(a.schemeName)}</td>
        <td>${new Date(a.createdAt).toLocaleDateString("en-IN")}</td>
        <td>${escapeHtml(a.documentName || "-")}</td>
        <td><strong>${escapeHtml(a.status)}</strong></td>
        <td>${escapeHtml(a.remarks || "-")}</td>
      </tr>`).join("")}
  </table></div>`;
}

async function applyForScheme(schemeId) {
  if (!currentStudent) {
    alert("Please login first.");
    showSection("login");
    return;
  }

  const scheme = allSchemes.find(s => s._id === schemeId);
  if (!scheme) return;

  const documentName = prompt("Enter the document name you are submitting:");
  if (!documentName) return;

  const res = await fetch(`${API}/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: currentStudent.studentId,
      studentName: currentStudent.name,
      schemeId: scheme._id,
      schemeName: scheme.name,
      familyIncome: currentStudent.familyIncome || 0,
      documentName
    })
  });

  const result = await res.json();
  alert(result.message);
  if (res.ok) loadStudentDashboard();
}

function logoutStudent() {
  currentStudent = null;
  showSection("home");
}

// ADMIN
async function loadAdmin() {
  await loadStats();
  await loadAdminSchemes();
  await loadAdminApplications();
}

async function loadStats() {
  const res = await fetch(`${API}/admin/stats`);
  const s = await res.json();
  statStudents.textContent = s.students;
  statSchemes.textContent = s.schemes;
  statApplications.textContent = s.applications;
  statApproved.textContent = s.approved;
  statPending.textContent = s.pending;
  statRejected.textContent = s.rejected;
}

document.getElementById("schemeForm").addEventListener("submit", async e => {
  e.preventDefault();

  const res = await fetch(`${API}/aid-schemes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: schemeName.value.trim(),
      amount: Number(schemeAmount.value),
      eligibility: schemeEligibility.value.trim(),
      requiredDocuments: schemeDocuments.value.trim(),
      deadline: schemeDeadline.value,
      description: schemeDescription.value.trim()
    })
  });

  const result = await res.json();
  alert(result.message);

  if (res.ok) {
    document.getElementById("schemeForm").reset();
    loadAdmin();
  }
});

async function loadAdminSchemes() {
  const res = await fetch(`${API}/aid-schemes`);
  const schemes = await res.json();

  adminSchemes.innerHTML = schemes.length ? `
    <div class="table-wrap"><table>
      <tr><th>Scheme</th><th>Amount</th><th>Deadline</th><th>Action</th></tr>
      ${schemes.map(s => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>₹${Number(s.amount).toLocaleString("en-IN")}</td>
          <td>${escapeHtml(s.deadline || "-")}</td>
          <td>
            <button class="action-btn" onclick="editScheme('${s._id}')">Edit</button>
            <button class="action-btn" onclick="deleteScheme('${s._id}')">Delete</button>
          </td>
        </tr>`).join("")}
    </table></div>` : `<div class="empty">No schemes added.</div>`;
}

async function editScheme(id) {
  const name = prompt("New scheme name:");
  if (!name) return;
  const amount = Number(prompt("New amount:"));
  if (!amount) return;

  const res = await fetch(`${API}/aid-schemes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, amount })
  });

  const result = await res.json();
  alert(result.message);
  if (res.ok) loadAdmin();
}

async function deleteScheme(id) {
  if (!confirm("Are you sure you want to delete this scheme?")) return;

  const res = await fetch(`${API}/aid-schemes/${id}`, { method: "DELETE" });
  const result = await res.json();
  alert(result.message);
  if (res.ok) loadAdmin();
}

async function loadAdminApplications() {
  const res = await fetch(`${API}/applications`);
  const apps = await res.json();

  adminApplications.innerHTML = apps.length ? `
    <div class="table-wrap"><table>
      <tr><th>Student</th><th>ID</th><th>Scheme</th><th>Document</th><th>Status</th><th>Action</th></tr>
      ${apps.map(a => `
        <tr>
          <td>${escapeHtml(a.studentName)}</td>
          <td>${escapeHtml(a.studentId)}</td>
          <td>${escapeHtml(a.schemeName)}</td>
          <td>${escapeHtml(a.documentName || "-")}</td>
          <td><strong>${escapeHtml(a.status)}</strong></td>
          <td>
            <button class="action-btn" onclick="updateApplication('${a._id}','Under Verification')">Verify</button>
            <button class="action-btn" onclick="updateApplication('${a._id}','Approved')">Approve</button>
            <button class="action-btn" onclick="updateApplication('${a._id}','Rejected')">Reject</button>
          </td>
        </tr>`).join("")}
    </table></div>` : `<div class="empty">No student applications yet.</div>`;
}

async function updateApplication(id, status) {
  const remarks = prompt(`Remarks for ${status}:`) || "";

  const res = await fetch(`${API}/applications/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, remarks })
  });

  const result = await res.json();
  alert(result.message);
  if (res.ok) loadAdmin();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

loadSchemes();