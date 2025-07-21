import { ServerAPI, ServerResponse } from "decky-frontend-lib";
import { Deal } from "../models/Deal";
import { Game } from "../models/Game";
import { SETTINGS, Setting } from "../utils/Settings";
import { CACHE } from "../utils/Cache";

interface DealResponse {
    id: string;
    deals: Deal[];
}

interface GameResponse {
    found: boolean;
    game: Game;
}

interface ServerResponseResult {
    body: string
}

interface HistoryDeal {
  timestamp: string;
  shop: Shop;
  deal: Deal;
}

interface Shop {
  id: number;
  name: string;
}

export let isThereAnyDealService: IsThereAnyDealService

export class IsThereAnyDealService {
  private readonly serverAPI: ServerAPI;
  // I know this basically does nothing, but it makes me feel better
  private readonly notWhatYouThinkItIs = "TTJNMllqWmxZbVkwWVdFeE1XSTBPREZqTlRJell6UmpZVFk0WW1RMVlUQmpZVFkzTURRek13PT0="

  constructor(serverAPI: ServerAPI) {
    this.serverAPI = serverAPI;
  }

  static init(serverAPI: ServerAPI) {
    isThereAnyDealService = new IsThereAnyDealService(serverAPI);
  }

  public getIsThereAnyDealGameFromSteamAppId = async (appId:string): Promise<Game> => {
    const gameCacheKeyBase = "steamAppIdToItadGame-"

    // Check if game exists in cache if so return it
    const game = await CACHE.loadValue(gameCacheKeyBase + appId)
    if(game) return game;

    // Get the isThereAnyDeal gameID from a steam appId
    const serverResponseGameId: ServerResponse<ServerResponseResult> =
                    await this.serverAPI.fetchNoCors<ServerResponseResult>(
                        `https://api.isthereanydeal.com/games/lookup/v1?key=${atob(atob(this.notWhatYouThinkItIs))}&appid=${appId}`,
                        {
                            method: 'GET',
                        }
                    );
    
    
    if(!serverResponseGameId.success) throw new Error("Game does not exist on IsThereAnyDeal")
    const gameResponse: GameResponse = JSON.parse(serverResponseGameId.result.body) 

    // Save game to cache to minimize API calls
    CACHE.setValue(gameCacheKeyBase + appId, gameResponse.game)

    return gameResponse.game
  }


public getBestDealForGameId = async (gameId: string): Promise<Deal | null> => {
  const country: string = await SETTINGS.load(Setting.COUNTRY);
  //  const allowVouchersInPrices = await SETTINGS.load(Setting.ALLOW_VOUCHERS_IN_PRICES);

  // API-Aufruf zum history/v2 Endpoint, nur Steam-Shops
  const serverResponseDeals: ServerResponse<ServerResponseResult> = 
      await this.serverAPI.fetchNoCors<ServerResponseResult>(
        `https://api.isthereanydeal.com/games/storelow/v2?key=${atob(atob(this.notWhatYouThinkItIs))}&country=${country}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          //@ts-ignore
          json: [gameId],
        }
  );

  if (!serverResponseDeals.success) throw new Error("IsThereAnyDeal is unavailable");

  // JSON-Array parsen, das nur Steam-Deals enthält (wegen &shops=steam im URL)
  const historyDeals: any = JSON.parse(serverResponseDeals.result.body)[0];
  if (!historyDeals || !historyDeals.lows || historyDeals.lows.length === 0) {
    return null; // Funktion beenden, wenn kein Deal gefunden wurde
  }

  const steamDeal = historyDeals.lows.find((deal: any) => deal.shop && deal.shop.id === 61);
  if (!steamDeal) throw new Error("No Steam deal found");

  // niedrigsten Preis unter den Steam-Deals finden
  let lowestPriceDeal = steamDeal;
  for (const historyDeal of historyDeals.lows) {
    if (historyDeal.shop.id === 61 && historyDeal.price.amount < lowestPriceDeal.price.amount) {
      lowestPriceDeal = historyDeal;
    }
  }

  return lowestPriceDeal as Deal;
}

}