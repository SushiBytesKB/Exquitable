 
 
 const testReservations = [
  {
    name: "John Smith",
    table: 305,
    numPeople: 3,
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: 415,
    numPeople: 3,
    time: "12:25",
    notes: "none",
    status: "booked"
  },
  {
    name: "John Smith",
    table: 305,
    numPeople: 3,
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne",
    status: "booked"
  },
  {
    name: "James Miller",
    table: 415,
    numPeople: 3,
    time: "12:25",
    notes: "none",
    status: "booked"
  }
];


  function reservationCard(reservation)
  {
    const reservationCardElement = document.createElement('div');
    reservationCardElement.className = "reservationCard";

    reservationCardElement.innerHTML = 
    `<h1>${reservation.name}</h1>
    <hr class= "nameDivider">
    <p>PAX: ${reservation.numPeople}</p>
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

