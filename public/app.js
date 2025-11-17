document.getElementById("generateBtn").addEventListener("click", generateRule);
document.getElementById("clearHistory").addEventListener("click", clearHistory);

async function generateRule() {
  const text = document.getElementById("userInput").value;
  if (!text) return alert("Enter a rule description!");

  const res = await fetch("/api/generate", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "Content-Type": "application/json" }
  });

  const data = await res.json();

  if (!data.ok) {
    alert("Error: " + data.error);
    return;
  }

  // Display results
  document.getElementById("exprBox").textContent = data.expression || "";
  document.getElementById("jsonBox").textContent = JSON.stringify(data.json_rule, null, 2);
  document.getElementById("explanation").textContent = data.explanation || "";

  const warnings = document.getElementById("warningList");
  warnings.innerHTML = "";
  (data.warnings || []).forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    warnings.appendChild(li);
  });

  loadHistory();
}

async function loadHistory() {
  const res = await fetch("/api/history");
  const list = await res.json();

  const panel = document.getElementById("historyList");
  panel.innerHTML = "";

  list.forEach(rule => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.textContent = rule.user_input.substring(0, 50) + "...";
    panel.appendChild(div);
  });
}

async function clearHistory() {
  await fetch("/api/history/clear", { method: "POST" });
  loadHistory();
}

loadHistory();
