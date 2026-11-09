// Point the application's own database client at the test database before any module reads DATABASE_URL.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
