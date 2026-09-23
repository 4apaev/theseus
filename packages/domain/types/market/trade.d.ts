/** the years a leg takes, as the universe counts them */
export declare function commonFrameYears(ly: number, c: number): number

/** the years a leg takes, as the crew counts them */
export declare function shipFrameYears(ly: number, c: number): number

/** common years to game seconds */
export declare function gameSeconds(years: number, secondsPerYear: number): number

/** what a principal grows to over the voyage */
export declare function capitalCost(principal: number, interest: number, years: number): number
