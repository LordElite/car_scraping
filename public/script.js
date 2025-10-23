document.addEventListener("DOMContentLoaded", () => {
  // --- Copart ---
  const copartForm = document.getElementById("copartForm");
  const copartLoader = document.getElementById("copart-loader");
  const copartResults = document.getElementById("copart-results");

  copartForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const params = new URLSearchParams({
    make: copartForm.make?.value || "",
    model: copartForm.model?.value || "",
    yearFrom: copartForm.yearFrom?.value || "",
    yearTo: copartForm.yearTo?.value || "",
    odometerFrom: copartForm.odometerFrom?.value || "",
    odometerTo: copartForm.odometerTo?.value || "",
    location: copartForm.location?.value || "",
    damage: copartForm.damage?.value || "",
    condition: copartForm.condition?.value || "",
    type: copartForm.type?.value || ""
  });

  copartLoader.classList.remove("hidden");
  copartResults.innerHTML = "";

  try {
    const res = await fetch(`/search-copart?${params.toString()}`);
    const data = await res.json();
    copartLoader.classList.add("hidden");

    if (!data.vehicles?.length) {
      copartResults.innerHTML = "<p>No results found.</p>";
      return;
    }

    renderTable(copartResults, data.vehicles);
  } catch (err) {
    copartLoader.classList.add("hidden");
    copartResults.innerHTML = "<p style='color:red;'>Error fetching data.</p>";
  }
});

  // --- IAAI ---
  const iaaiForm = document.getElementById("iaaiForm");
  const iaaiLoader = document.getElementById("iaai-loader");
  const iaaiResults = document.getElementById("iaai-results");

  iaaiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const stockNumber = iaaiForm.stockNumber.value.trim();
    if (!stockNumber) return alert("Please enter a stock number.");

    iaaiLoader.classList.remove("hidden");
    iaaiResults.innerHTML = "";

    try {
      const res = await fetch(`/search-iaai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockNumber }),
      });
      const data = await res.json();
      iaaiLoader.classList.add("hidden");

      if (!data.vehicles?.length) {
        iaaiResults.innerHTML = "<p>No results found.</p>";
        return;
      }

      renderTable(iaaiResults, data.vehicles);
    } catch (err) {
      iaaiLoader.classList.add("hidden");
      iaaiResults.innerHTML = "<p style='color:red;'>Error fetching data.</p>";
    }
  });

  // --- Function to render table ---
 function renderTable(container, vehicles) {
  const headers = Object.keys(vehicles[0]);
  const tableHTML = `
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
        ${vehicles.map(v =>
          `<tr>${headers.map(h => `<td>${v[h]}</td>`).join("")}</tr>`
        ).join("")}
      </tbody>
    </table>`;
  container.innerHTML = tableHTML;

  // 🔹 Habilitar ordenamiento después de renderizar
  const table = container.querySelector("table");
  enableSorting(table);
}



  // --- Function to enable sorting ---
function enableSorting(table) {
  const headers = table.querySelectorAll("th");
  headers.forEach((th, index) => {
    th.addEventListener("click", () => {
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const isAsc = th.classList.toggle("asc");

      // Quita clases de orden de otros encabezados
      headers.forEach(h => {
        if (h !== th) h.classList.remove("asc", "desc");
      });
      th.classList.toggle("desc", !isAsc);

      // Ordenar las filas según la columna seleccionada
      const sortedRows = rows.sort((a, b) => {
        const cellA = a.children[index].innerText.trim();
        const cellB = b.children[index].innerText.trim();

        // Intentar convertir a número si aplica
        const numA = parseFloat(cellA.replace(/[^0-9.-]/g, ""));
        const numB = parseFloat(cellB.replace(/[^0-9.-]/g, ""));
        const bothNumbers = !isNaN(numA) && !isNaN(numB);

        if (bothNumbers) {
          return isAsc ? numA - numB : numB - numA;
        } else {
          return isAsc
            ? cellA.localeCompare(cellB)
            : cellB.localeCompare(cellA);
        }
      });

      // Reinsertar las filas ordenadas
      tbody.innerHTML = "";
      sortedRows.forEach(row => tbody.appendChild(row));
    });
  });
}


});

