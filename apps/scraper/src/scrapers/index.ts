import type { Scraper } from "@distro/contracts";
import { fakeScraper } from "./fake/index.js";

export const scrapers: Scraper[] = [fakeScraper];
