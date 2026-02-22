const statusEl = document.querySelector("#status");
const tbody = document.querySelector("#journeyTable tbody");
const refreshBtn = document.querySelector("#refresh");

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

refreshBtn.addEventListener("click", () => {
  void loadJourneys();
});

void loadJourneys();
