 
 
 const testReservations = [
  {
    name: "John Smith",
    table: 305,
    numPeople: 3,
    date: "25.11.2025",
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: 415,
    numPeople: 3,
    date: "24.12.2025",
    time: "12:25",
    notes: "Christmas",
    status: "booked"
  },
  {
    name: "John Smith",
    table: 305,
    numPeople: 3,
    date: "30.11.2025",
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: 415,
    numPeople: 3,
    date: "15.11.2025",
    time: "12:25",
    notes: "none",
    status: "booked"
  }
];


const testSeatingChart =
[
  {
    roomName: "300",
    listTables: ["301","305","302","306","311"],
    listSeats: ["1","5","6","2","3"]
  },

  {
    roomName: "400",
    listTables: ["401","415","402","406","418"],
    listSeats: ["1","5","4","2","6"]
  },

  {
    roomName: "500",
    listTables: ["504","515","502","512","511"],
    listSeats: ["3","2","3","2","6"]
  },

  

]


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