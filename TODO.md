Commands
Backend
uvicorn backend.main:app --reload --port 8000
http://127.0.0.1:8000/docs

Frontend
npm --prefix frontend run dev
http://localhost:3000/selector


TODO
- Documentate API, App functionality etc. 
x Redo the UI
x Fix current game scraping ETA, Logs showing the wrong total, global eta
- Add a way to view reviews in the UI
x Add a way to export reviews as a csv / xlsx file 
x Change where the Export button is located
x Add an export UI
x Fix applist download on app start
x Change 'Read to Start' widget to match dark mode / light mode themes on the scraper page. 
x Remove redundant text from Select Game To Export box - Make default a string about selecting a game and remove 'select a game' form the dropdown box.
x Add complete scraping mode 
x Add in ability to filter by min / max playtime, this should use playtime at time of review, not overall playtime. 
x Make setting persistant
x Rearrange Scraping UI. Change Language & filter + datetime to be just Filtering and range appropriately. 
x Max playtime can never be less than or equal to min playtime. 
x Throughput graph should NEVER be negative. 
- Analysis page should mimick all of the settings on the scraper page, complete scraping becomes complete analysis, rate limit become simultaneous batching setting (how many batches to send to the server at once)
- Change the scraper gradient to be green, analysis gradient to be purple and site wide gradient to be orange 
- Move analysis buttons from widget to be in the header
- Remove old buttons 