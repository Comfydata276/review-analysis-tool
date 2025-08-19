Commands
Backend
uvicorn backend.main:app --reload --port 8000
http://127.0.0.1:8000/docs

Frontend
npm --prefix frontend run dev
http://localhost:3000/selector


TODO
- Documentate API, App functionality etc. 
- Redo the UI
x Fix current game scraping ETA, Logs showing the wrong total, global eta
- Add a way to view reviews in the UI
x Add a way to export reviews as a csv / xlsx file 
x Change where the Export button is located
x Add an export UI
x Fix applist download on app start
x Change 'Read to Start' widget to match dark mode / light mode themes on the scraper page. 
x Remove redundant text from Select Game To Export box - Make default a string about selecting a game and remove 'select a game' form the dropdown box.
- Add complete scraping mode 
- Add in ability to filter by min / max playtime, this should use playtime at time of review, not overall playtime. 
- Make setting persistant
- Rearrange Scraping UI. Change Language & filter + datetime to be just Filtering and range appropriately. 

