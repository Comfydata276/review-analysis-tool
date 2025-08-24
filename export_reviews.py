import sqlite3, csv
conn=sqlite3.connect("app.db")
cur=conn.cursor()
cur.execute("SELECT * FROM reviews")
cols=[d[0] for d in cur.description]
rows=cur.fetchall()
with open("reviews_dump.csv","w",newline="",encoding="utf-8") as f:
    w=csv.writer(f)
    w.writerow(cols)
    w.writerows(rows)
print("EXPORT_OK")
conn.close()
