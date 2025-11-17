 
 
 const testReservation = 
  {
    name: "John Smith",
    table: 305,
    numPeople: 3,
    time: "13:45",
    notes: "It is the birthday of his wife so please greet them with champagne"
  };


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
    <p>Notes: ${reservation.notes}</p>
    <button>Complete</button>`;

    return reservationCardElement;
  }

  const reservationsDivElement = document.getElementById('reservations');

  const newReservation = reservationCard(testReservation);

  reservationsDivElement.appendChild(newReservation);

