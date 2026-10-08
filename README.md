# Thesis Management System

A full-stack web application that manages the complete lifecycle of a university diploma thesis, from topic proposal to final grading, for three user roles: **students**, **professors** and the **department secretariat**.

Built with **Node.js / Express**, **MySQL** and **Handlebars** as a team project (2 people) for the *Web Programming & Systems* course at the University of Patras (CEID).

![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## Features

**Professors**
- Create thesis topics (with PDF description upload) and assign them to students
- Accept or decline invitations to join a 3-member examination committee
- Keep private notes per thesis, publish the public announcement of the defense
- Enable and submit grades; view the thesis list with status/role filters and export it to CSV or JSON
- Statistics dashboard (average completion time, average grade, number of theses per role)

**Students**
- View their assigned topic and its status history
- Invite professors to form the committee
- Upload the thesis draft, add links to extra material and set the examination date/room
- View the auto-generated examination report (*praktiko*)

**Secretariat**
- Bulk-import students and professors from a JSON file
- View active theses, record the General Assembly decision number, cancel or complete a thesis

**Platform**
- Role-based access control with server-side sessions stored in MySQL
- Login rate limiting (`express-rate-limit`) and request validation (`express-validator`)
- File uploads with `multer`; CSV export with `json2csv`
- Public endpoint that lists upcoming thesis defenses

## Architecture

```
server.js            Express app: middleware, sessions, rate limiting, route mounting
db.js                MySQL connection pool
routes/              REST API routers (assignments, invitations, students, topics, ...)
controllers/         Business logic and SQL queries per domain
views/               Handlebars pages (role dashboards, login, report)
public/              Front-end JavaScript and CSS for each dashboard
database/            MySQL schema with sample data
```

The thesis moves through a state machine stored in the `assignments` table (`Pending → Active → UnderReview → Completed / Canceled`), and every change is logged in `assignmentstatushistory`.

## Run locally

Requirements: Node.js 18+, MySQL 8.

```bash
git clone https://github.com/AndrianaKp/thesis-management-system.git
cd thesis-management-system
npm install

# create the database and load the schema + sample data
mysql -u root -p -e "CREATE DATABASE thesis_db"
mysql -u root -p thesis_db < database/schema_and_sample_data.sql

cp .env.example .env      # then fill in your MySQL credentials
npm start                 # http://localhost:3000
```

## Known limitations / next steps

This was built as a course prototype. If I took it to production I would:
- hash passwords with `bcrypt` (currently stored in plain text in the sample data)
- add automated tests for the controllers
- containerise the app and database with Docker Compose

## My role

We built the application together as a team of two. My focus was:
- **Back end & database:** Express routes, controllers and the MySQL queries behind them, including the thesis status workflow and its history log
- **Professor features:** topic creation and editing, assigning topics to students, committee invitations, notes, grading, the statistics dashboard and CSV/JSON export of the thesis list
- **Student features (shared with my teammate):** parts of the student dashboard, such as committee invitations and thesis submission details
