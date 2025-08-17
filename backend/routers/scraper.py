from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..scraper_service import scraper_service


router = APIRouter(prefix="/scraper", tags=["scraper"])


@router.post("/start", status_code=202)
async def start_scraper(payload: dict):
	try:
		await scraper_service.start(payload)
		return {"message": "Scraper started"}
	except RuntimeError as e:
		raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
async def stop_scraper():
	await scraper_service.stop()
	return {"message": "Stop signaled"}


@router.get("/status")
async def status_scraper():
	p = scraper_service.progress
	return {
		"is_running": p.is_running,
		"current_game": p.current_game,
		"current_game_progress": {
			"scraped": p.current_game_scraped,
			"total": p.current_game_total,
			"eta_seconds": p.eta_seconds_current(),
		},
		"global_progress": {
			"scraped": p.global_scraped,
			"total": p.global_total,
			"eta_seconds": p.eta_seconds_global(),
		},
		"logs": p.logs,
	}



