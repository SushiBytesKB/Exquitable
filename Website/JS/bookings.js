 const testReservations = [
  {
    name: "John Smith",
    table: "305",
    numPeople: 3,
    date: "2025-11-25",
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: "415",
    numPeople: 3,
    date: "2025-12-24",
    time: "12:25",
    notes: "Christmas",
    status: "booked"
  },
  {
    name: "John Smith",
    table: "325",
    numPeople: 3,
    date: "2025-11-30",
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: "45",
    numPeople: 3,
    date: "2025-11-15",
    time: "12:25",
    notes: "none",
    status: "booked"
  }
];

const restaurantLayout = 
[
  { roomName: "300", tables: ["301","305","302","306","311"] },
  { roomName: "400", tables: ["401","415","402","406","418"] },
  { roomName: "500", tables: ["504","515","502","512","511"] }
];


  function reservationCard(reservation)
  {
    const reservationCardElement = document.createElement('div');
    reservationCardElement.className = "reservationCard";

    reservationCardElement.innerHTML = 
    `<h1>${reservation.name}</h1>
    <hr class= "nameDivider">
    <p>PAX: ${reservation.numPeople}</p>
    <p>Date: ${reservation.date}</p>
    <p>Time: ${reservation.time}</p>
    <p>Table: ${reservation.table}</p>
    <hr>
    <p class= "details">Notes: ${reservation.notes}</p>
    <button class = "btnComplete">Complete</button>
    <button class = "btnDelete">Delete</button>
    <button class = "btnModify">Modify</button>`;

    return reservationCardElement;
  }

  const reservationsDivElement = document.getElementById('reservations');

  for(reservation of testReservations)
  {
    if(reservation.status == "booked")
    {
      const newReservation = reservationCard(reservation);
      reservationsDivElement.appendChild(newReservation);
    }
  }

function openPopup()
{
  //everytime we open the popup we want to update the available tables
  getAvailableTables();
  document.getElementById('popup').style.display = "flex";
}

function closePopup()
{
  document.getElementById('popup').style.display = 'none';
}

const bookingForm = document.querySelector("#popup form");

if(bookingForm)
{

  bookingForm.addEventListener("submit", (event) => {

  event.preventDefault();

  const name = event.target.elements.customerNameBooking.value;
  const email = event.target.elements.customerEmailBooking.value;
  const guests = event.target.elements.customerNumberBooking.value;
  const date = event.target.elements.customerDateBooking.value;
  const time = event.target.elements.customerTimeBooking.value;

  const newReservation = {
  name: name,
  table: 415,
  numPeople: guests,
  time: time,
  notes: "This is a test from the add reservations popup",
  status: "booked"
  }
  const reservationsDivElement = document.getElementById('reservations');

  const newCardElement = reservationCard(newReservation);

  reservationsDivElement.appendChild(newCardElement);

  bookingForm.reset();
  });
}

function getAvailableTables()
{
  const dropdownTables = document.getElementById("customerTableBooking");

  dropdownTables.innerHTML = "";

  const bookedTables = [];

  for (const reservation of testReservations)
  {
    // check what tables are booked
    if(reservation.status == "booked")
    {
      //add them to the list
      bookedTables.push(reservation.table);
    }
  }

  //go through the rooms of the restaurant
  for (const room of restaurantLayout)
  {
    // go through tables of the restaurant room
    for (const table of room.tables)
    {
      // if the table is not in the bookedTables list
      if(!bookedTables.includes(table))
      {
        // create the option and push it to the input form
        const option = document.createElement("option");
        option.value = table;
        option.textContent = `Table ${table}`;
        dropdownTables.appendChild(option);
      }
    }
  }

}