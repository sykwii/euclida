SELECT 'CREATE DATABASE euclida_logistics_db'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'euclida_logistics_db'
)
\gexec

SELECT 'CREATE DATABASE euclida_analytics_db'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'euclida_analytics_db'
)
\gexec
