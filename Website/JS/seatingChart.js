const testSeatingChart = [
  {
    roomName: "300",
    listTables: ["301", "305", "302", "306", "311"],
    listSeats: ["1", "5", "6", "2", "3"],
  },

  {
    roomName: "400",
    listTables: ["401", "415", "402", "406", "418"],
    listSeats: ["1", "5", "4", "2", "6"],
  },

  {
    roomName: "500",
    listTables: ["504", "515", "502", "512", "511"],
    listSeats: ["3", "2", "3", "2", "6"],
  },
];

function openPopup() {
  document.getElementById("popup").style.display = "flex";
}

function closePopup() {
  document.getElementById("popup").style.display = "none";
}

const seatingChartDivElement = document.getElementById("seatingChartDiv");

function seatingChartCard(room) {
  const seatingChartCardElement = document.createElement("div");
  seatingChartCardElement.className = "reservationCard";

  let tablesHtml = "";

  for (let i = 0; i < room.listTables.length; i++) {
    tablesHtml += `<p><strong>Table ${room.listTables[i]}:</strong> ${room.listSeats[i]} Seats</p><br>`;
  }

  seatingChartCardElement.innerHTML = `<h1>${room.roomName}</h1>
  <hr class= "nameDivider">

  <div class="room-details">${tablesHtml} </div>

  <hr>
  <button class = "btnDelete">Delete</button>
  <button class = "btnModify">Modify</button>`;

  return seatingChartCardElement;
}

for (const room of testSeatingChart) {
  const newRoom = seatingChartCard(room);
  seatingChartDivElement.appendChild(newRoom);
}

function addTableRow() {
  const container = document.getElementById("tableListContainer");

  const row = document.createElement("div");
  row.className = "tableRow";
  row.innerHTML = `
     <input class="newRoomTable" type="number" placeholder="Table Number">
     <input class="newRoomSeat" type="number" placeholder="Seats">
  `;

  container.appendChild(row);
}

const addRoomForm = document.getElementById("addRoomForm");

if (addRoomForm) {
  addRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();

    // get room name
    const roomName = document.querySelector(".newRoomName");

    // get table and seat inputs
    const tableInputs = document.querySelectorAll(".newRoomTable");
    const seatInputs = document.querySelectorAll(".newRoomSeat");

    // save in arrays
    let tablesArray = [];
    let seatsArray = [];

    for (let i = 0; i < tableInputs.length; i++) {
      // check if it is empty or not
      if (tableInputs[i].value) {
        tablesArray.push(tableInputs[i].value);
        seatsArray.push(seatInputs[i].value);
      }
    }

    const newRoom = {
      roomName: roomName,
      listTables: tablesArray,
      listSeats: seatsArray,
    };

    const newCard = seatingChartCard(newRoom);
    seatingChartDivElement.appendChild(newCard);

    closePopup();
    addRoomForm.reset();

    document.getElementById(
      "tableListContainer"
    ).innerHTML = `<div class="tableRow">
      <input class="newRoomTable" type="number" placeholder="Table Number" required>
      <input class="newRoomSeat" type="number" placeholder="Number of Seats" required>
  </div>`;
  });
}
