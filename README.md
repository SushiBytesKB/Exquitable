# ExquiTable

Exquisite Table - Smart Restaurant Reservation Website
By: Sushant, Bettina, Saad

### Installation Instructions:

1. Make sure you have Visual Studio Code installed
   a. If not, here is instructions how to do so: https://code.visualstudio.com/download
2. Download the ExquiTable ZIP File
3. Extract the ExquiTable ZIP file in a location of your choice
4. Open Visual Studio Code and click “open folder”
5. Select your extracted ExquiTable folder
6. Make sure you have the extension “Live Server” installed
   a. If not, on the left side menu inside Visual Studio Code, click on “Extensions”
   b. Next, search for “Live Server” by the publisher Ritwick Dey with around 71.3 Million downloads
   c. Click install
   d. If needed, restart Visual Studio Code
7. Next, inside Visual Studio Code, in the file explorer on the left, find ExquiTable -> Website -> login.html
8. Right click it and select “Open with Live Server”

### Running Instructions:

Once you are at our login screen, you may use any of the existing accounts to view their information:

- Email: owner@expensive.com --- Password: secret123
- Email: owner@mid.com --------- Password: secret123
- Email: owner@cheap.com ------- Password: secret123

Otherwise, you may sign up and create your own account. However, we already have a few filled information and data entries for the existing accounts!

You will then find yourself to be at the dashboard. You may explore the statistical reports of your restaurant with our reservation system. Do not mind the 0% AI score however, as the proposed AI architecture is not fully connected with the frontend and BaaS.

You may also view existing bookings, make bookings, and delete bookings! If you would like to make a booking, ensure to put the UUID of table within the table field (purposely designed since AI was initially proposed to be in charge of the entire decision-making process). For testing, certain seats are for certain restaurants. Here are a few to try out:

- Email: owner@expensive.com --- Table UUID: c5a5119d-5b3c-4d36-85aa-349b6b9412b4
- Email: owner@mid.com --------- Table UUID: 638c9c8a-87d4-474b-b39c-1f4f59090881
- Email: owner@cheap.com ------- Table UUID: 64cfcb9a-f852-41a2-915e-188e5630a579

Disclaimer - Seating Chart is currently not synced with Supabase.

### File Structure Overview: Brief explanation of important files and folders.

There are two main folders, AI and Website. The frontend logic is within the Website director. AI directory communicates as a backend to the website via API routes created using Flask, which is why you run python server.py within AI directory to communicate with the AI models. Supabase is extensively called within the website directory for fetching and updating data. Lastly, the website stack is composed of the vanilla tech stack (CSS, JS, HTML).

### Attribution:

Debugging and Password Encryption Sign Up Logic supported by Gemini, AI model.
Background and Logo images created by Gemini.
