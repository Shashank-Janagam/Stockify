import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('../Stockify-Backend/.env')

DATABASE_URL = os.getenv('DATABASE_URL')
print('DATABASE_URL:', DATABASE_URL)
try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute('''
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    ''')
    tables = cur.fetchall()
    print('Tables:', tables)
    for t in tables:
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t[0]}'")
        print(f"Table {t[0]}: {cur.fetchall()}")
except Exception as e:
    print('Error:', e)
