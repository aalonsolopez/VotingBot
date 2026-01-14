#! /bin/bash

# This script sets up the database for the application.
# It creates the necessary database and user with appropriate permissions.
DB_NAME="example_db"
DB_USER="example_user"
DB_PASSWORD=""
DB_HOST="localhost"
DB_PORT="5432"

# Create the database using docker
sudo docker run --name postgresql -e POSTGRES_DB=$DB_NAME -e POSTGRES_USER=$DB_USER -e POSTGRES_PASSWORD=$DB_PASSWORD -p $DB_PORT:5432 -d postgres