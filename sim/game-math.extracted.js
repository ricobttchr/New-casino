/* js/game-math.js */
(function(){
const STAKES_CENTS=[10,20,30,40,50,80,100];
const GAME_KEY='shark-abyss';
const PAYLINES=[
 [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],
 [0,1,2,1,0],[3,2,1,2,3],[0,0,1,0,0],[3,3,2,3,3],
 [1,0,0,0,1],[2,3,3,3,2],[1,2,3,2,1],[2,1,0,1,2],
 [0,1,1,1,0],[3,2,2,2,3],[1,1,0,1,1],[2,2,3,2,2],
 [0,1,2,3,3],[3,2,1,0,0],[0,1,0,1,0],[3,2,3,2,3]
];

// Paytable is expressed as line-bet multipliers. Total stake is split across 20 lines.
// Tuned by Monte Carlo rather than copied from a commercial game's proprietary reel strips.
const SYMBOLS={
  SHARK:{glyph:'🦈',weight:5,pays:[0,0,58.8,147,490]},
  DIVER:{glyph:'🤿',weight:8,pays:[0,0,39.2,88.2,254.8]},
  TURTLE:{glyph:'🐢',weight:11,pays:[0,0,24.5,58.8,147]},
  FISH:{glyph:'🐠',weight:15,pays:[0,0,19.6,39.2,88.2]},
  SHELL:{glyph:'🐚',weight:18,pays:[0,0,12.74,25.48,58.8]},
  PEARL:{glyph:'⚪',weight:20,pays:[0,0,9.8,18.62,37.24]},
  OCTO:{glyph:'🐙',weight:0,pays:[0,0,0,0,0],scatter:true}
};

const BASE_SYMBOL_KEYS=['SHARK','DIVER','TURTLE','FISH','SHELL','PEARL'];
const BASE_WEIGHTS=BASE_SYMBOL_KEYS.map(k=>SYMBOLS[k].weight);
const REVEAL_SYMBOLS=['SHARK','DIVER','TURTLE','FISH'];
const LINE_CALIBRATION=.997;

function cryptoFloat(){
  if(globalThis.crypto?.getRandomValues){
    const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0]/4294967296;
  }
  return Math.random();
}
function randomId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);else for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function pickWeighted(rng=cryptoFloat){
  const total=BASE_WEIGHTS.reduce((a,b)=>a+b,0);let r=rng()*total;
  for(let i=0;i<BASE_SYMBOL_KEYS.length;i++){r-=BASE_WEIGHTS[i];if(r<=0)return BASE_SYMBOL_KEYS[i]}
  return 'PEARL';
}
function randint(max,rng=cryptoFloat){return Math.min(max-1,Math.floor(rng()*max))}

function createGrid({rng=cryptoFloat,scatterReelChance=.09,mysteryChance=.18}={}){
  const grid=Array.from({length:5},()=>Array.from({length:4},()=>pickWeighted(rng)));
  // At most one scatter per reel; this keeps feature frequency realistic instead of flooding the grid.
  for(let c=0;c<5;c++)if(rng()<scatterReelChance)grid[c][randint(4,rng)]='OCTO';
  const mystery=[];
  if(rng()<mysteryChance){
    const col=1+randint(4,rng);const len=2+randint(3,rng);const start=randint(5-len,rng);const reveal=REVEAL_SYMBOLS[randint(REVEAL_SYMBOLS.length,rng)];
    for(let r=start;r<Math.min(4,start+len);r++)if(grid[col][r]!=='OCTO'){grid[col][r]=reveal;mystery.push([col,r])}
  }
  return {grid,mystery};
}

function evaluateGrid(grid,stakeCents,{multiplier=1}={}){
  let rawLineWinCents=0;const wins=[];const lineBetCents=stakeCents/PAYLINES.length;
  PAYLINES.forEach((line,lineIndex)=>{
    const first=grid[0][line[0]];if(SYMBOLS[first]?.scatter)return;
    let count=1;for(let c=1;c<5;c++){if(grid[c][line[c]]===first)count++;else break}
    const multiple=SYMBOLS[first]?.pays[count-1]||0;
    if(count>=3&&multiple>0){
      const raw=multiple*lineBetCents*multiplier*LINE_CALIBRATION;rawLineWinCents+=raw;
      wins.push({lineIndex,symbol:first,count,rawAmountCents:raw,cells:Array.from({length:count},(_,c)=>[c,line[c]])});
    }
  });
  const scatters=[];grid.forEach((col,c)=>col.forEach((s,r)=>{if(s==='OCTO')scatters.push([c,r])}));
  const scatterCount=scatters.length;
  const freeSpins=scatterCount===3?8:scatterCount===4?10:scatterCount>=5?12:0;
  const scatterWinCents=scatterCount===3?stakeCents*2:scatterCount===4?stakeCents*10:scatterCount>=5?stakeCents*50:0;
  if(scatterWinCents)wins.push({lineIndex:-1,symbol:'OCTO',count:scatterCount,rawAmountCents:scatterWinCents,cells:scatters});
  const totalCents=Math.max(0,Math.round(rawLineWinCents+scatterWinCents));
  const lineWinCents=Math.max(0,Math.round(rawLineWinCents));
  wins.forEach(w=>w.amountCents=Math.max(0,Math.round(w.rawAmountCents)));
  return {totalCents,lineWinCents,scatterWinCents,wins,freeSpins,scatterCount};
}

function generateSpin({stakeCents,isFreeSpin=false,multiplier=1,rng=cryptoFloat}={}){
  const {grid,mystery}=createGrid({rng,mysteryChance:isFreeSpin?.45:.18});
  const result=evaluateGrid(grid,stakeCents,{multiplier});
  return {
    id:randomId(),createdAt:Date.now(),stakeCents,isFreeSpin,multiplier,grid,mystery,
    ...result,
    // During free spins a mystery reveal raises the multiplier for the next free spin.
    nextMultiplier:isFreeSpin&&mystery.length?Math.min(10,multiplier+1):multiplier
  };
}

function nextFeatureState(previous,spin){
  const current=previous&&previous.remaining>0?{remaining:previous.remaining,multiplier:previous.multiplier||2,stakeCents:previous.stakeCents||spin.stakeCents}:{remaining:0,multiplier:2,stakeCents:spin.stakeCents};
  if(!spin.isFreeSpin&&spin.freeSpins>0)return {remaining:spin.freeSpins,multiplier:2,stakeCents:spin.stakeCents};
  if(spin.isFreeSpin){
    let remaining=Math.max(0,current.remaining-1);
    if(spin.freeSpins>0)remaining=Math.min(30,remaining+Math.min(5,spin.freeSpins));
    return {remaining,multiplier:spin.nextMultiplier||current.multiplier,stakeCents:current.stakeCents};
  }
  return {remaining:0,multiplier:2,stakeCents:spin.stakeCents};
}

window.__gameMath={STAKES_CENTS, GAME_KEY, PAYLINES, SYMBOLS, cryptoFloat, randomId, createGrid, evaluateGrid, generateSpin, nextFeatureState};
})();

/* js/fruit-math.js */
(function(){
const {cryptoFloat,randomId}=window.__gameMath;

const FRUIT_GAME_KEY='fruit-reactor';
const FRUIT_PAYLINES=[
  [1,1,1,1,1],
  [0,0,0,0,0],
  [2,2,2,2,2],
  [0,1,2,1,0],
  [2,1,0,1,2]
];
const FRUIT_SYMBOLS={
  SEVEN:{glyph:'7',weight:3,pays:[0,0,100,1000,5000],className:'seven'},
  BELL:{glyph:'🔔',weight:5,pays:[0,0,50,500,2500]},
  WATERMELON:{glyph:'🍉',weight:8,pays:[0,0,40,200,750]},
  PLUM:{glyph:'🍇',weight:9,pays:[0,0,40,200,750]},
  ORANGE:{glyph:'🍊',weight:11,pays:[0,0,20,100,250]},
  LEMON:{glyph:'🍋',weight:12,pays:[0,0,20,100,250]},
  CHERRY:{glyph:'🍒',weight:15,pays:[0,5,20,50,200]}
};
const KEYS=Object.keys(FRUIT_SYMBOLS);const WEIGHTS=KEYS.map(k=>FRUIT_SYMBOLS[k].weight);
// We keep the classic payout ratios but calibrate our independently-built reel model to 88.64% RTP.
// This does not reproduce Merkur's proprietary reel strips.
const FRUIT_CALIBRATION=.54928;
const weighted=(rng=cryptoFloat)=>{let r=rng()*WEIGHTS.reduce((a,b)=>a+b,0);for(let i=0;i<KEYS.length;i++){r-=WEIGHTS[i];if(r<=0)return KEYS[i]}return 'CHERRY'};
function createFruitGrid({rng=cryptoFloat}={}){return Array.from({length:5},()=>Array.from({length:3},()=>weighted(rng)))}
function evaluateFruitGrid(grid,stakeCents){
  const lineBet=stakeCents/FRUIT_PAYLINES.length;let raw=0;const wins=[];
  FRUIT_PAYLINES.forEach((line,lineIndex)=>{
    const first=grid[0][line[0]];let count=1;
    for(let c=1;c<5;c++){if(grid[c][line[c]]===first)count++;else break}
    const multiple=FRUIT_SYMBOLS[first]?.pays[count-1]||0;
    if(multiple>0){const amount=multiple*lineBet*FRUIT_CALIBRATION;raw+=amount;wins.push({lineIndex,symbol:first,count,amountCents:Math.max(0,Math.round(amount)),cells:Array.from({length:count},(_,c)=>[c,line[c]])})}
  });
  return {totalCents:Math.max(0,Math.round(raw)),wins};
}
function generateFruitSpin({stakeCents,rng=cryptoFloat}={}){
  const grid=createFruitGrid({rng});const result=evaluateFruitGrid(grid,stakeCents);
  return {id:randomId(),createdAt:Date.now(),gameKey:FRUIT_GAME_KEY,stakeCents,isFreeSpin:false,multiplier:1,grid,mystery:[],freeSpins:0,scatterCount:0,nextMultiplier:1,...result};
}

window.__fruitMath={FRUIT_GAME_KEY, FRUIT_PAYLINES, FRUIT_SYMBOLS, createFruitGrid, evaluateFruitGrid, generateFruitSpin};
})();

/* js/fancy-math.js */
(function(){
const {cryptoFloat,randomId}=window.__gameMath;

const FANCY_GAME_KEY='fancy-harvest';
const FANCY_PAYLINES=[
  [1,1,1,1,1],
  [0,0,0,0,0],
  [2,2,2,2,2],
  [0,1,2,1,0],
  [2,1,0,1,2]
];
const FANCY_SYMBOLS={
  SEVEN:{glyph:'7',weight:2,pays:[0,0,100,500,5500],className:'seven'},
  GRAPE:{glyph:'🍇',weight:5,pays:[0,0,39,150,800]},
  WATERMELON:{glyph:'🍉',weight:7,pays:[0,0,30,100,500]},
  PLUM:{glyph:'🟣',weight:9,pays:[0,0,20,60,250]},
  ORANGE:{glyph:'🍊',weight:10,pays:[0,0,15,40,150]},
  LEMON:{glyph:'🍋',weight:11,pays:[0,0,10,30,120]},
  CHERRY:{glyph:'🍒',weight:12,pays:[0,4.987,10,30,100]}
};
const KEYS=Object.keys(FANCY_SYMBOLS),WEIGHTS=KEYS.map(k=>FANCY_SYMBOLS[k].weight),TOTAL=WEIGHTS.reduce((a,b)=>a+b,0);
const weighted=(rng=cryptoFloat)=>{let r=rng()*TOTAL;for(let i=0;i<KEYS.length;i++){r-=WEIGHTS[i];if(r<=0)return KEYS[i]}return 'CHERRY'};
function createFancyGrid({rng=cryptoFloat}={}){return Array.from({length:5},()=>Array.from({length:3},()=>weighted(rng)))}
function evaluateFancyGrid(grid,stakeCents){
  const lineBet=stakeCents/FANCY_PAYLINES.length;let raw=0;const wins=[];
  FANCY_PAYLINES.forEach((line,lineIndex)=>{
    const first=grid[0][line[0]];let count=1;
    for(let c=1;c<5;c++){if(grid[c][line[c]]===first)count++;else break}
    const multiple=FANCY_SYMBOLS[first]?.pays[count-1]||0;
    if(multiple>0){const amount=multiple*lineBet;raw+=amount;wins.push({lineIndex,symbol:first,count,amountCents:Math.max(0,Math.round(amount)),cells:Array.from({length:count},(_,c)=>[c,line[c]])})}
  });
  return {totalCents:Math.max(0,Math.round(raw)),wins};
}
function generateFancySpin({stakeCents,rng=cryptoFloat}={}){
  const grid=createFancyGrid({rng}),result=evaluateFancyGrid(grid,stakeCents);
  return {id:randomId(),createdAt:Date.now(),gameKey:FANCY_GAME_KEY,stakeCents,isFreeSpin:false,multiplier:1,grid,mystery:[],freeSpins:0,scatterCount:0,nextMultiplier:1,...result};
}

window.__fancyMath={FANCY_GAME_KEY, FANCY_PAYLINES, FANCY_SYMBOLS, createFancyGrid, evaluateFancyGrid, generateFancySpin};
})();

/* js/book-math.js */
(function(){
const {cryptoFloat,randomId}=window.__gameMath;

const BOOK_GAME_KEY='tomb-of-kings';
const BOOK_PAYLINES=[
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
  [1,0,0,0,1],[1,2,2,2,1],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1]
];
const BOOK_SYMBOLS={
  KING:{glyph:'👑',weight:3,pays:[0,0,100,750,5000]},
  QUEEN:{glyph:'🏺',weight:5,pays:[0,0,60,300,1500]},
  GUARD:{glyph:'🗿',weight:7,pays:[0,0,40,200,800]},
  SCARAB:{glyph:'🪲',weight:9,pays:[0,0,30,120,500]},
  A:{glyph:'A',weight:12,pays:[0,0,15,50,150]},
  K:{glyph:'K',weight:14,pays:[0,0,12,40,120]},
  Q:{glyph:'Q',weight:16,pays:[0,0,10,30,100]},
  J:{glyph:'J',weight:18,pays:[0,0,8,25,80]},
  TEN:{glyph:'10',weight:20,pays:[0,0,8,20,60]},
  BOOK:{glyph:'📕',weight:3,pays:[0,0,0,0,0]}
};
const REGULAR=Object.keys(BOOK_SYMBOLS).filter(k=>k!=='BOOK'),KEYS=Object.keys(BOOK_SYMBOLS),TOTAL=KEYS.reduce((a,k)=>a+BOOK_SYMBOLS[k].weight,0),BOOK_CAL=.696;
const weighted=(rng=cryptoFloat)=>{let r=rng()*TOTAL;for(const k of KEYS){r-=BOOK_SYMBOLS[k].weight;if(r<=0)return k}return 'TEN'};
function createBookGrid({rng=cryptoFloat}={}){return Array.from({length:5},()=>Array.from({length:3},()=>weighted(rng)))}
function lineWins(grid,stakeCents){const lineBet=stakeCents/BOOK_PAYLINES.length;let raw=0;const wins=[];BOOK_PAYLINES.forEach((line,lineIndex)=>{let best=null;for(const candidate of REGULAR){let count=0;for(let c=0;c<5;c++){const sym=grid[c][line[c]];if(sym===candidate||sym==='BOOK')count++;else break}if(count>=3){const amount=(BOOK_SYMBOLS[candidate].pays[count-1]||0)*lineBet*BOOK_CAL;if(amount>0&&(!best||amount>best.amount)){best={lineIndex,symbol:candidate,count,amount,cells:Array.from({length:count},(_,c)=>[c,line[c]])}}}}if(best){raw+=best.amount;wins.push({...best,amountCents:Math.round(best.amount)})}});return {raw,wins}}
function scatterResult(grid,stakeCents){const cells=[];grid.forEach((col,c)=>col.forEach((sym,r)=>{if(sym==='BOOK')cells.push([c,r])}));const n=cells.length,multiple=n===2?2:n===3?5:n===4?20:n>=5?100:0;return {count:n,cells,amountCents:Math.round(stakeCents*multiple)}}
function expansionResult(grid,symbol,stakeCents){if(!symbol)return null;const reels=[];for(let c=0;c<5;c++)if(grid[c].includes(symbol))reels.push(c);if(reels.length<3)return null;const multiple=BOOK_SYMBOLS[symbol].pays[reels.length-1]||0;if(!multiple)return null;const amountCents=Math.round(multiple*(stakeCents/10)*10*BOOK_CAL);const cells=reels.flatMap(c=>[[c,0],[c,1],[c,2]]);return {symbol,reels,cells,amountCents}}
function generateBookSpin({stakeCents,isFreeSpin=false,expandingSymbol=null,rng=cryptoFloat}={}){const grid=createBookGrid({rng}),base=lineWins(grid,stakeCents),scatter=scatterResult(grid,stakeCents),expanding=isFreeSpin?expansionResult(grid,expandingSymbol,stakeCents):null;const freeSpins=scatter.count>=3?10:0,chosenExpandingSymbol=!isFreeSpin&&freeSpins?REGULAR[Math.floor(rng()*REGULAR.length)]:null;const wins=[...base.wins];if(scatter.amountCents)wins.push({lineIndex:-1,symbol:'BOOK',count:scatter.count,amountCents:scatter.amountCents,cells:scatter.cells});if(expanding?.amountCents)wins.push({lineIndex:-2,symbol:expanding.symbol,count:expanding.reels.length,amountCents:expanding.amountCents,cells:expanding.cells});return {id:randomId(),createdAt:Date.now(),gameKey:BOOK_GAME_KEY,stakeCents,isFreeSpin,multiplier:1,grid,mystery:[],wins,totalCents:Math.max(0,Math.round(base.raw+scatter.amountCents+(expanding?.amountCents||0))),freeSpins,scatterCount:scatter.count,nextMultiplier:1,expanding,chosenExpandingSymbol}}
function nextBookFeatureState(before,spin){if(!spin.isFreeSpin&&spin.freeSpins>0)return {remaining:10,multiplier:1,stakeCents:spin.stakeCents,expandingSymbol:spin.chosenExpandingSymbol};if(spin.isFreeSpin){let remaining=Math.max(0,Number(before.remaining||0)-1);if(spin.freeSpins>0)remaining=Math.min(100,remaining+10);return {remaining,multiplier:1,stakeCents:before.stakeCents||spin.stakeCents,expandingSymbol:before.expandingSymbol||spin.chosenExpandingSymbol||null}}return {remaining:0,multiplier:1,stakeCents:spin.stakeCents,expandingSymbol:null}}

window.__bookMath={BOOK_GAME_KEY, BOOK_PAYLINES, BOOK_SYMBOLS, createBookGrid, generateBookSpin, nextBookFeatureState};
})();

