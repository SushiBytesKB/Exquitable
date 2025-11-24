const testUsers= [

{
    email: "admin@exquitable.com",
    password: "admin"
},
{
    email: "user@exquitable.com",
    password: "user"
},
{
    email: "guest@exquitable.com",
    password: "guest"
}
];

// sign up needs: email and password
// login needs: email and password

const loginForm = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");

if (loginForm)
{
    loginForm.addEventListener("submit", event =>
    {
        event.preventDefault();

        const emailInput = document.getElementById("email").value;
        const passwordInput = document.getElementById("password").value;

        let isAuthenticated = false;

        for (const user of testUsers)
        {
            if (user.email == emailInput && user.password == passwordInput)
            {
                isAuthenticated = true;
                break;
            }
        }

        if(isAuthenticated)
        {
            errorMessage.style.display = "none";

            window.location.href = "index.html";

        }
        else
        {
            errorMessage.style.display = "block";
            errorMessage.textContent = "Incorrect email or password";
        }
    });
}