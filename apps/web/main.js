const statusEl = document.querySelector("#status");
const tbody = document.querySelector("#journeyTable tbody");
const refreshBtn = document.querySelector("#refresh");
const csvReminderDoneEl = document.querySelector("#csvReminderDone");
const csvReminderStatusEl = document.querySelector("#csvReminderStatus");
const forwardTemplateEl = document.querySelector("#forwardTemplate");
const copyForwardTemplateBtn = document.querySelector("#copyForwardTemplate");

const CSV_REMINDER_KEY = "csvReminderDone";

const FORWARDING_TEMPLATE = `Subject: Please auto-forward your TfL monthly journey CSVs

Hi [Client Name],

To run your monthly refund check, please set a mailbox auto-forward rule:
1) When sender contains no-reply@tfl.gov.uk (or TfL Oyster contact address)
2) And subject contains "journey" or "CSV"
3) Forward to: [your-ingest-email@yourdomain.com]

Please keep yourself in CC so you have a copy.
You can disable forwarding any time.

Thanks!`;

async function loadJourneys() {
  statusEl.textContent = "Loading...";
  tbody.innerHTML = "";

  try {
    const response = await fetch("http://localhost:5080/journeys");
    const journeys = await response.json();

    for (const journey of journeys) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${journey.startStation}</td>
        <td>${journey.endStation}</td>
        <td>${new Date(journey.startedAt).toLocaleString()}</td>
        <td>${new Date(journey.endedAt).toLocaleString()}</td>
        <td>£${Number(journey.fare).toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    }

    statusEl.textContent = `Loaded ${journeys.length} journey rows.`;
  } catch (error) {
    statusEl.textContent = `Failed to load journeys: ${error}`;
  }
}

function renderCsvReminder() {
  const reminderDone = localStorage.getItem(CSV_REMINDER_KEY) === "true";
  csvReminderDoneEl.checked = reminderDone;
  csvReminderStatusEl.textContent = reminderDone
    ? "Great — CSV-by-email is marked complete."
    : "Pending — leave this unchecked until your TfL email arrives and setup is done.";
}

function setupReminderTools() {
  forwardTemplateEl.value = FORWARDING_TEMPLATE;

  csvReminderDoneEl.addEventListener("change", () => {
    localStorage.setItem(CSV_REMINDER_KEY, String(csvReminderDoneEl.checked));
    renderCsvReminder();
  });

  copyForwardTemplateBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(FORWARDING_TEMPLATE);
      csvReminderStatusEl.textContent = "Template copied. Paste it into an email to your client.";
    } catch (error) {
      csvReminderStatusEl.textContent = `Could not copy template automatically: ${error}`;
    }
  });

  renderCsvReminder();
}

refreshBtn.addEventListener("click", () => {
  void loadJourneys();
});

setupReminderTools();
void loadJourneys();
