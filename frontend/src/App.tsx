import React, { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GameSelector } from "./pages/GameSelector";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./context/ThemeProvider";

const Scraper = lazy(() => import("./pages/Scraper").then((m) => ({ default: m.Scraper })));
const Analysis = lazy(() => import("./pages/Analysis").then((m) => ({ default: m.Analysis })));

export default function App() {
	return (
		<ThemeProvider>
			<BrowserRouter>
				<Layout>
					<Routes>
						<Route path="/" element={<Navigate to="/selector" replace />} />
						<Route path="/selector" element={<GameSelector />} />
						<Route
							path="/scraper"
							element={
								<Suspense fallback={<div className="p-8 text-center">Loading Scraper...</div>}>
									<Scraper />
								</Suspense>
							}
						/>
						<Route
							path="/analysis"
							element={
								<Suspense fallback={<div className="p-8 text-center">Loading Analysis...</div>}>
									<Analysis />
								</Suspense>
							}
						/>
					</Routes>
				</Layout>
			</BrowserRouter>
		</ThemeProvider>
	);
}


