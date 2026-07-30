
(function(global){
  'use strict';
  const asNumber=v=>Number.isFinite(Number(v))?Number(v):0;
  const validDate=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v+'T00:00:00').getTime());
  function includedPeople(plan){
    const people=Array.isArray(plan?.people)?plan.people:[];
    return people.filter((_,i)=>i===0 || plan.hasPartner!==false);
  }
  function ageAtYearEnd(birthDate,year){
    if(!validDate(birthDate))return null;
    return year-new Date(birthDate+'T00:00:00').getFullYear();
  }
  function yearAtAge(birthDate,age){
    if(!validDate(birthDate)||asNumber(age)<0)return null;
    return new Date(birthDate+'T00:00:00').getFullYear()+Math.ceil(asNumber(age));
  }
  function finalProjectionYear(plan,startYear,planningAge){
    const years=includedPeople(plan).map(p=>yearAtAge(p.birthDate,planningAge)).filter(Number.isFinite);
    return years.length?Math.max(startYear,...years):startYear;
  }
  function milestoneEvents(plan){
    const events=[];
    const people=includedPeople(plan);
    people.forEach(person=>{
      const year=yearAtAge(person.birthDate,person.retirementAge);
      if(year)events.push({year,name:`${person.name||'Household member'} retires`,type:'Retirement',detail:`Target retirement age ${person.retirementAge}`});
    });
    for(const source of plan?.incomeSources||[]){
      const owner=people.find(p=>p.name===source.owner)||people[0];
      if(!owner)continue;
      const start=asNumber(source.startAge)>0?yearAtAge(owner.birthDate,source.startAge):null;
      const end=asNumber(source.endAge)>0&&asNumber(source.endAge)<110?yearAtAge(owner.birthDate,source.endAge):null;
      if(start)events.push({year:start,name:`${source.name||source.type||'Income'} begins`,type:'Income start',detail:`${source.owner||owner.name||''}`});
      if(end)events.push({year:end,name:`${source.name||source.type||'Income'} ends`,type:'Income end',detail:`${source.owner||owner.name||''}`});
    }
    for(const e of plan?.events||[]){
      const year=Math.trunc(asNumber(e.year));
      if(year)events.push({year,name:e.name||'Timeline event',type:e.type||'Event',detail:e.amount?`${e.type||'Event'} · $${Math.round(asNumber(e.amount)).toLocaleString('en-CA')}`:(e.type||'Event')});
    }
    return events.sort((a,b)=>a.year-b.year||a.name.localeCompare(b.name));
  }
  function buildTimeline(plan,options={}){
    if(!plan||typeof plan!=='object')throw new TypeError('A Harbour North plan object is required.');
    const startYear=Math.trunc(asNumber(options.startYear)||new Date().getFullYear());
    const planningAge=Math.trunc(asNumber(options.planningAge)||asNumber(plan.household?.planningAge)||95);
    if(startYear<1900||startYear>2300)throw new RangeError('Projection start year is outside the supported range.');
    if(planningAge<40||planningAge>120)throw new RangeError('Planning horizon age must be between 40 and 120.');
    const people=includedPeople(plan);
    const endYear=finalProjectionYear(plan,startYear,planningAge);
    const milestones=milestoneEvents(plan);
    const byYear=new Map();
    milestones.forEach(e=>{if(!byYear.has(e.year))byYear.set(e.year,[]);byYear.get(e.year).push(e)});
    const rows=[];
    for(let year=startYear;year<=endYear;year++){
      rows.push({year,people:people.map(p=>{const age=ageAtYearEnd(p.birthDate,year);const retirementAge=asNumber(p.retirementAge)||65;return{name:p.name||'Household member',age,retirementAge,status:age===null?'Unknown':age>=retirementAge?'Retired':'Working'}}),events:byYear.get(year)||[]});
    }
    return rows;
  }
  function runSelfTests(){
    const failures=[];let total=0;
    const test=(name,fn)=>{total++;try{if(!fn())failures.push(name)}catch{failures.push(name)}};
    test('Age calculation',()=>ageAtYearEnd('1974-07-23',2026)===52);
    test('Retirement year with half age',()=>yearAtAge('1974-07-23',55.5)===2030);
    test('Partner exclusion',()=>includedPeople({hasPartner:false,people:[{},{}]}).length===1);
    test('Timeline inclusive endpoints',()=>buildTimeline({hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:65}],household:{planningAge:40},incomeSources:[],events:[]},{startYear:2036,planningAge:40}).length===5);
    test('Retirement status transition',()=>{const r=buildTimeline({hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:40}],household:{planningAge:41},incomeSources:[],events:[]},{startYear:2039,planningAge:41});return r[0].people[0].status==='Working'&&r[1].people[0].status==='Retired'});
    test('User event attachment',()=>buildTimeline({hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:65}],household:{planningAge:40},incomeSources:[],events:[{name:'Goal',type:'Expense',year:2037,amount:1000}]},{startYear:2036,planningAge:40})[1].events.some(e=>e.name==='Goal'));
    return {ok:failures.length===0,total,failed:failures};
  }
  global.HNTimeline={includedPeople,ageAtYearEnd,yearAtAge,milestoneEvents,buildTimeline,runSelfTests};
  if(typeof module!=='undefined'&&module.exports)module.exports=global.HNTimeline;
})(typeof window!=='undefined'?window:globalThis);




(function(global){
  'use strict';
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  function sourceActive(source,ownerAge){
    if(ownerAge===null||ownerAge===undefined)return false;
    const start=Math.max(0,n(source.startAge));
    const end=n(source.endAge)>0?n(source.endAge):110;
    return ownerAge>=start && ownerAge<end;
  }
  function sourceAmount(source,year,startYear,indexRate){
    const base=Math.max(0,n(source.annualAmount));
    if(!source.indexed)return base;
    return base*Math.pow(1+n(indexRate)/100,Math.max(0,year-startYear));
  }
  function buildIncomeProjection(plan,timeline,options={}){
    const startYear=n(options.startYear)||timeline?.[0]?.year||new Date().getFullYear();
    const indexRate=n(options.indexRate);
    const people=global.HNTimeline.includedPeople(plan);
    const sources=Array.isArray(plan?.incomeSources)?plan.incomeSources:[];
    return (timeline||[]).map(row=>{
      const details=sources.map(source=>{
        const ownerIndex=Math.max(0,people.findIndex(p=>p.name===source.owner));
        const owner=people[ownerIndex]||people[0];
        const personRow=row.people[ownerIndex]||row.people[0];
        const active=!!owner&&sourceActive(source,personRow?.age);
        const amount=active?sourceAmount(source,row.year,startYear,indexRate):0;
        const taxable=source.taxable!==false;
        return{id:source.id,name:source.name||source.type||'Income',type:source.type||'Other',owner:source.owner||owner?.name||'Household',active,amount,taxable,indexed:!!source.indexed};
      });
      const totalIncome=details.reduce((sum,x)=>sum+x.amount,0);
      const taxableIncome=details.filter(x=>x.taxable).reduce((sum,x)=>sum+x.amount,0);
      return {...row,income:{details,totalIncome,taxableIncome,nonTaxableIncome:totalIncome-taxableIncome}};
    });
  }
  function runSelfTests(){
    const failed=[];let total=0;const test=(name,fn)=>{total++;try{if(!fn())failed.push(name)}catch(e){failed.push(name)}};
    test('Source active before end age',()=>sourceActive({startAge:55,endAge:65},64));
    test('Source excluded at end age',()=>!sourceActive({startAge:55,endAge:65},65));
    test('Start age zero is active',()=>sourceActive({startAge:0,endAge:55},40));
    test('Non-indexed amount unchanged',()=>sourceAmount({annualAmount:10000,indexed:false},2030,2026,2)===10000);
    test('Indexed amount compounds',()=>Math.round(sourceAmount({annualAmount:10000,indexed:true},2028,2026,2))===10404);
    test('Tax split',()=>{const plan={hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:65}],incomeSources:[{id:'1',name:'Salary',owner:'A',annualAmount:10000,startAge:0,endAge:65,indexed:false,taxable:true},{id:'2',name:'Benefit',owner:'A',annualAmount:5000,startAge:0,endAge:65,indexed:false,taxable:false}]};const tl=global.HNTimeline.buildTimeline({...plan,household:{planningAge:40},events:[]},{startYear:2036,planningAge:40});const r=buildIncomeProjection(plan,tl,{startYear:2036,indexRate:2})[0];return r.income.totalIncome===15000&&r.income.taxableIncome===10000&&r.income.nonTaxableIncome===5000});
    return{ok:failed.length===0,total,failed};
  }
  global.HNIncome={sourceActive,sourceAmount,buildIncomeProjection,runSelfTests};
})(typeof window!=='undefined'?window:globalThis);




(function(global){
  'use strict';
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const FEDERAL_2026={brackets:[[58523,.14],[117045,.205],[181440,.26],[258482,.29],[Infinity,.33]],bpaMax:16452,bpaMin:14829,bpaPhaseStart:181440,bpaPhaseEnd:258482,creditRate:.14};
  const PROVINCES={
    'Alberta':{code:'AB',brackets:[[61200,.08],[154259,.10],[185111,.12],[246813,.13],[370220,.14],[Infinity,.15]],bpa:22769},
    'British Columbia':{code:'BC',brackets:[[50363,.056],[100728,.077],[115648,.105],[140430,.1229],[190405,.147],[265545,.168],[Infinity,.205]],bpa:13216},
    'Manitoba':{code:'MB',brackets:[[47564,.108],[101200,.1275],[Infinity,.174]],bpa:15780,bpaPhaseStart:200000,bpaPhaseEnd:400000,bpaMin:0},
    'New Brunswick':{code:'NB',brackets:[[52333,.094],[104666,.14],[193861,.16],[Infinity,.195]],bpa:13664},
    'Newfoundland and Labrador':{code:'NL',brackets:[[44678,.087],[89354,.145],[159528,.158],[223340,.178],[285319,.198],[570638,.208],[1141275,.213],[Infinity,.218]],bpa:13094},
    'Northwest Territories':{code:'NT',brackets:[[53003,.059],[106009,.086],[172346,.122],[Infinity,.1405]],bpa:18198},
    'Nova Scotia':{code:'NS',brackets:[[30995,.0879],[61991,.1495],[97417,.1667],[157124,.175],[Infinity,.21]],bpa:11932},
    'Nunavut':{code:'NU',brackets:[[55801,.04],[111602,.07],[181439,.09],[Infinity,.115]],bpa:19659},
    'Ontario':{code:'ON',brackets:[[53891,.0505],[107785,.0915],[150000,.1116],[220000,.1216],[Infinity,.1316]],bpa:12989},
    'Prince Edward Island':{code:'PE',brackets:[[33928,.095],[65820,.1347],[106890,.166],[142520,.1762],[200000,.19],[Infinity,.20]],bpa:15000},
    'Quebec':{code:'QC',brackets:[[54345,.14],[108680,.19],[132245,.24],[Infinity,.2575]],bpa:18952,federalAbatement:.165},
    'Saskatchewan':{code:'SK',brackets:[[54532,.105],[155805,.125],[Infinity,.145]],bpa:20381},
    'Yukon':{code:'YT',brackets:[[58523,.064],[117045,.09],[181440,.109],[500000,.128],[Infinity,.15]],bpaFormula:'federal'}
  };
  function indexed(value,year,indexRate){return n(value)*Math.pow(1+n(indexRate)/100,Math.max(0,n(year)-2026))}
  function bracketTax(income,brackets,year,indexRate){
    const taxable=Math.max(0,n(income));let tax=0,lower=0;
    for(const [rawUpper,rate] of brackets){const upper=rawUpper===Infinity?Infinity:indexed(rawUpper,year,indexRate);const portion=Math.max(0,Math.min(taxable,upper)-lower);tax+=portion*rate;if(taxable<=upper)break;lower=upper}
    return tax;
  }
  function federalBpa(income,year,indexRate){
    const max=indexed(FEDERAL_2026.bpaMax,year,indexRate),min=indexed(FEDERAL_2026.bpaMin,year,indexRate),start=indexed(FEDERAL_2026.bpaPhaseStart,year,indexRate),end=indexed(FEDERAL_2026.bpaPhaseEnd,year,indexRate),x=n(income);
    if(x<=start)return max;if(x>=end)return min;return max-(max-min)*(x-start)/(end-start);
  }
  function provincialBpa(config,income,year,indexRate){
    if(config.bpaFormula==='federal')return federalBpa(income,year,indexRate);
    const max=indexed(config.bpa||0,year,indexRate);
    if(config.bpaPhaseStart===undefined)return max;
    const start=indexed(config.bpaPhaseStart,year,indexRate),end=indexed(config.bpaPhaseEnd,year,indexRate),min=indexed(config.bpaMin||0,year,indexRate);
    if(income<=start)return max;if(income>=end)return min;return max-(max-min)*(income-start)/(end-start);
  }
  function ontarioHealthPremium(income){
    const a=Math.max(0,n(income));
    if(a<=20000)return 0;if(a<=36000)return Math.min(300,.06*(a-20000));if(a<=48000)return Math.min(450,300+.06*(a-36000));if(a<=72000)return Math.min(600,450+.25*(a-48000));if(a<=200000)return Math.min(750,600+.25*(a-72000));return Math.min(900,750+.25*(a-200000));
  }
  function provincialAdjustments(province,income,basicTax,year,indexRate){
    let tax=Math.max(0,basicTax),adjustment=0;
    if(province==='British Columbia'){
      const low=indexed(25570,year,indexRate),high=indexed(41722,year,indexRate),maxReduction=indexed(575,year,indexRate);
      let reduction=income<=low?Math.min(tax,maxReduction):income<=high?Math.min(tax,Math.max(0,maxReduction-(income-low)*.0356)):0;
      adjustment-=reduction;tax=Math.max(0,tax-reduction);
    }
    if(province==='Ontario'){
      const first=indexed(5818,year,indexRate),second=indexed(7446,year,indexRate);
      const surtax=tax<=first?0:tax<=second?.2*(tax-first):.2*(tax-first)+.36*(tax-second);
      const reduction=Math.max(0,Math.min(tax+surtax,2*indexed(300,year,indexRate)-(tax+surtax)));
      const health=ontarioHealthPremium(income);
      adjustment+=surtax+health-reduction;tax=Math.max(0,tax+surtax-reduction)+health;
    }
    return{tax,adjustment};
  }
  function estimatePersonTax(taxableIncome,year,indexRate,province='British Columbia'){
    const income=Math.max(0,n(taxableIncome)),config=PROVINCES[province];
    const federalGross=bracketTax(income,FEDERAL_2026.brackets,year,indexRate);
    const federalCredit=federalBpa(income,year,indexRate)*FEDERAL_2026.creditRate;
    let federal=Math.max(0,federalGross-federalCredit);
    if(config?.federalAbatement)federal=Math.max(0,federal*(1-config.federalAbatement));
    let provincial=0,provinceSupported=!!config;
    if(config){
      const gross=bracketTax(income,config.brackets,year,indexRate),lowest=config.brackets[0][1],credit=provincialBpa(config,income,year,indexRate)*lowest;
      provincial=provincialAdjustments(province,income,Math.max(0,gross-credit),year,indexRate).tax;
    }
    return{taxableIncome:income,federal,provincial,total:federal+provincial,provinceSupported,provinceCode:config?.code||''};
  }
  function estimateHouseholdTax(taxableByPerson,year,indexRate,province){
    const byPerson=Object.entries(taxableByPerson||{}).map(([name,income])=>({name,...estimatePersonTax(income,year,indexRate,province)}));
    return{byPerson,federal:byPerson.reduce((s,x)=>s+x.federal,0),provincial:byPerson.reduce((s,x)=>s+x.provincial,0),total:byPerson.reduce((s,x)=>s+x.total,0),provinceSupported:byPerson.every(x=>x.provinceSupported)};
  }
  function runSelfTests(){
    const failed=[];let total=0;const test=(name,fn)=>{total++;try{if(!fn())failed.push(name)}catch{failed.push(name)}};
    test('Zero income has zero tax',()=>estimatePersonTax(0,2026,0).total===0);
    test('Federal first bracket calculation',()=>Math.round(estimatePersonTax(58523,2026,0,'Alberta').federal)===Math.round(58523*.14-16452*.14));
    test('BC first bracket includes reduction',()=>estimatePersonTax(25000,2026,0,'British Columbia').provincial<25000*.056-13216*.056);
    test('All provinces and territories supported',()=>Object.keys(PROVINCES).every(p=>estimatePersonTax(50000,2026,0,p).provinceSupported));
    test('Quebec federal abatement lowers federal tax',()=>estimatePersonTax(100000,2026,0,'Quebec').federal<estimatePersonTax(100000,2026,0,'Ontario').federal);
    test('Ontario health premium applies',()=>estimatePersonTax(50000,2026,0,'Ontario').provincial>bracketTax(50000,PROVINCES['Ontario'].brackets,2026,0)-12989*.0505);
    test('Two-person tax calculated separately',()=>{const split=estimateHouseholdTax({A:50000,B:50000},2026,0,'British Columbia').total;const one=estimateHouseholdTax({A:100000},2026,0,'British Columbia').total;return split<one});
    test('Future brackets indexed',()=>estimatePersonTax(60000,2027,2,'Alberta').total<estimatePersonTax(60000,2026,0,'Alberta').total);
    return{ok:failed.length===0,total,failed};
  }
  global.HNTax={PROVINCES,indexed,bracketTax,federalBpa,provincialBpa,estimatePersonTax,estimateHouseholdTax,runSelfTests};
})(typeof window!=='undefined'?window:globalThis);




(function(global){
  'use strict';
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const INVEST_TYPES=['Cash','RRSP/RRIF','TFSA','FHSA','Non-registered'];
  const WITHDRAWAL_STRATEGIES={
    balanced:{label:'Balanced',description:'Uses taxable and cash assets first, then registered savings while preserving the TFSA for later flexibility.',order:['Non-registered','Cash','RRSP/RRIF','TFSA','FHSA']},
    minimumTax:{label:'Minimum current tax',description:'Prioritizes tax-free sources and defers taxable RRSP/RRIF withdrawals.',order:['Cash','TFSA','Non-registered','FHSA','RRSP/RRIF']},
    rrspMeltdown:{label:'RRSP/RRIF drawdown',description:'Draws registered savings earlier to reduce future registered balances and possible forced withdrawals.',order:['RRSP/RRIF','Non-registered','Cash','TFSA','FHSA']},
    taxOptimized:{label:'Tax-bracket optimized',description:'Uses low-income retirement years to draw RRSP/RRIF funds toward the indexed first federal tax-bracket ceiling, then applies a balanced account order.',order:['Non-registered','Cash','RRSP/RRIF','TFSA','FHSA']},
    preserveTFSA:{label:'Preserve TFSA',description:'Keeps TFSA assets invested as long as possible for tax-free growth and estate flexibility.',order:['Non-registered','Cash','RRSP/RRIF','FHSA','TFSA']},
    preserveRRSP:{label:'Preserve RRSP/RRIF',description:'Defers registered withdrawals until other available accounts have been used.',order:['Non-registered','Cash','TFSA','FHSA','RRSP/RRIF']},
    custom:{label:'Custom order',description:'Uses the account order selected on the Withdrawal Strategy page.',order:['Non-registered','Cash','RRSP/RRIF','TFSA','FHSA']}
  };
  function withdrawalStrategy(plan){
    const saved=plan?.planningModel?.withdrawalStrategy||{},mode=WITHDRAWAL_STRATEGIES[saved.mode]?saved.mode:'balanced';
    const valid=['Cash','RRSP/RRIF','TFSA','FHSA','Non-registered'];
    const custom=Array.isArray(saved.customOrder)?saved.customOrder.filter((x,i,a)=>valid.includes(x)&&a.indexOf(x)===i):[];
    for(const type of valid)if(!custom.includes(type))custom.push(type);
    return{mode,order:mode==='custom'?custom:WITHDRAWAL_STRATEGIES[mode].order,label:WITHDRAWAL_STRATEGIES[mode].label};
  }
  function annualSpendingBreakdown(plan,year,startYear,inflationRate){
    const factor=Math.pow(1+n(inflationRate)/100,Math.max(0,year-startYear));
    const primary=plan.people?.[0],birthYear=primary?.birthDate?new Date(primary.birthDate+'T00:00:00').getFullYear():null;
    const age=birthYear?year-birthYear:null;
    const details=(plan.expenses||[]).filter(x=>{
      if(age==null)return true;
      const start=n(x.startAge),end=n(x.endAge);
      return(!start||age>=start)&&(!end||age<=end);
    }).map(x=>({name:x.name||x.category||'Spending',category:x.category||'Other',amount:n(x.amount)*(x.frequency==='Monthly'?12:1)*factor}));
    const categories={};for(const x of details)categories[x.category]=(categories[x.category]||0)+x.amount;
    return{total:details.reduce((sum,x)=>sum+x.amount,0),details,categories};
  }
  function annualSpending(plan,year,startYear,inflationRate){return annualSpendingBreakdown(plan,year,startYear,inflationRate).total}
  function eventCashFlow(plan,year){
    let income=0,expense=0,taxableIncome=0;
    for(const e of plan.events||[]){if(Math.trunc(n(e.year))!==year)continue;if(['Income','Inheritance','Gift','Asset sale'].includes(e.type)){income+=n(e.amount);if(e.type==='Income')taxableIncome+=n(e.amount)}else expense+=n(e.amount)}
    return{income,expense,taxableIncome};
  }
  function ownerWorking(account,row,people){
    const ownerIndex=account.owner==='Household'?-1:Math.max(0,people.findIndex(p=>p.name===account.owner));
    const working=ownerIndex<0?row.people.some(p=>p.status==='Working'):row.people[ownerIndex]?.status==='Working';
    if(!working)return false;
    const endAge=n(account.contributionEndAge);
    if(!endAge)return true;
    if(ownerIndex<0)return row.people.some(p=>p.status==='Working'&&n(p.age)<=endAge);
    return n(row.people[ownerIndex]?.age)<=endAge;
  }
  function taxableIncomeByPerson(row,people,eventTaxable=0){
    const result={};people.forEach(p=>result[p.name||'Household member']=0);
    for(const x of row.income.details||[]){if(!x.active||!x.taxable)continue;const key=result[x.owner]!==undefined?x.owner:(people[0]?.name||'Household member');result[key]=(result[key]||0)+x.amount}
    if(eventTaxable){const key=people[0]?.name||'Household member';result[key]=(result[key]||0)+eventTaxable}
    return result;
  }
  function copyAccounts(accounts){return accounts.map(a=>({...a}))}
  function withdraw(accounts,need,plan){
    let remaining=Math.max(0,need),withdrawals=0;const byAccount=[],strategy=withdrawalStrategy(plan);
    for(const type of strategy.order){for(const a of accounts.filter(x=>x.type===type)){const take=Math.min(a.balance,remaining);a.balance-=take;remaining-=take;withdrawals+=take;if(take>0)byAccount.push({id:a.id,name:a.name,type:a.type,owner:a.owner,amount:take});if(remaining<=.01)break}if(remaining<=.01)break}
    return{withdrawals,unfunded:Math.max(0,remaining),byAccount,strategy:strategy.mode,strategyLabel:strategy.label};
  }
  function taxBracketDrawdown(accounts,plan,row,people,baseTaxable,year,indexRate,province){
    const strategy=withdrawalStrategy(plan);
    if(strategy.mode!=='taxOptimized')return{accounts:copyAccounts(accounts),amount:0,byAccount:[],taxable:{...baseTaxable},tax:global.HNTax.estimateHouseholdTax(baseTaxable,year,indexRate,province),target:0};
    const working=copyAccounts(accounts),taxable={...baseTaxable},byAccount=[];
    const target=global.HNTax.indexed(58523,year,indexRate);
    for(const person of people){
      const rowPerson=(row.people||[]).find(p=>p.name===person.name);
      if(rowPerson?.status!=='Retired')continue;
      const owner=person.name||'Household member';
      let room=Math.max(0,target-(taxable[owner]||0));
      if(room<=.01)continue;
      for(const account of working.filter(a=>a.type==='RRSP/RRIF'&&a.owner===owner)){
        const take=Math.min(account.balance,room);
        if(take<=0)continue;
        account.balance-=take;room-=take;taxable[owner]=(taxable[owner]||0)+take;
        byAccount.push({id:account.id,name:account.name,type:account.type,owner:account.owner,amount:take,planned:true});
        if(room<=.01)break;
      }
    }
    const amount=byAccount.reduce((s,x)=>s+x.amount,0);
    return{accounts:working,amount,byAccount,taxable,tax:global.HNTax.estimateHouseholdTax(taxable,year,indexRate,province),target};
  }
  function buildProjection(plan,incomeRows,options={}){
    const startYear=n(options.startYear)||incomeRows?.[0]?.year||new Date().getFullYear(),inflationRate=n(options.indexRate),people=global.HNTimeline.includedPeople(plan),province=plan.household?.province||'British Columbia';
    let accounts=(plan.accounts||[]).filter(a=>INVEST_TYPES.includes(a.type)).map(a=>({...a,balance:Math.max(0,n(a.balance))}));
    const emergencyFund=Math.max(0,n(plan.household?.emergencyFundAmount));
    if(emergencyFund>0)accounts.push({id:'emergency-fund',name:'Emergency fund',type:'Cash',owner:'Household',balance:emergencyFund,returnRate:0,annualContribution:0});
    if(!accounts.some(a=>a.type==='Cash'))accounts.push({id:'synthetic-cash',name:'Unallocated cash',type:'Cash',owner:'Household',balance:0,returnRate:0,annualContribution:0});
    const nonInvestmentAssets=(plan.accounts||[]).filter(a=>!INVEST_TYPES.includes(a.type)).reduce((s,a)=>s+n(a.balance),0),debt=(plan.debts||[]).reduce((s,d)=>s+n(d.balance),0),rows=[];
    for(const row of incomeRows||[]){
      const ledger=accounts.map(a=>({id:a.id,name:a.name,type:a.type,owner:a.owner,openingBalance:a.balance,growth:0,contribution:0,withdrawal:0,retainedCash:0,closingBalance:0,expectedClosing:0,difference:0}));
      let growth=0;
      for(const a of accounts){const entry=ledger.find(x=>x.id===a.id),yearRate=a.type==='Cash'?n(a.returnRate):(Number.isFinite(Number(options.returnSeries?.[row.year]))?n(options.returnSeries[row.year]):n(a.returnRate)),g=a.balance*yearRate/100;a.balance+=g;entry.growth=g;growth+=g}
      const events=eventCashFlow(plan,row.year),totalIncome=row.income.totalIncome+events.income,spendingBreakdown=annualSpendingBreakdown(plan,row.year,startYear,inflationRate),spending=spendingBreakdown.total+events.expense;
      const baseTaxable=taxableIncomeByPerson(row,people,events.taxableIncome),baseTax=global.HNTax.estimateHouseholdTax(baseTaxable,row.year,inflationRate,province),afterTaxBeforeContributions=totalIncome-baseTax.total-spending;
      const planned=accounts.reduce((sum,a)=>sum+(ownerWorking(a,row,people)?Math.max(0,n(a.annualContribution)):0),0),contributions=Math.min(Math.max(0,afterTaxBeforeContributions),planned),contributionsByAccount=[];
      if(contributions>0){const eligible=accounts.filter(a=>ownerWorking(a,row,people)&&n(a.annualContribution)>0),totalPlan=eligible.reduce((sum,a)=>sum+n(a.annualContribution),0);for(const a of eligible){const amount=totalPlan>0?contributions*(n(a.annualContribution)/totalPlan):0;a.balance+=amount;ledger.find(x=>x.id===a.id).contribution+=amount;contributionsByAccount.push({id:a.id,name:a.name,type:a.type,amount})}}
      const optimized=taxBracketDrawdown(accounts,plan,row,people,baseTaxable,row.year,inflationRate,province);
      accounts=optimized.accounts;
      let finalTax=optimized.tax,withdrawResult={withdrawals:optimized.amount,unfunded:0,byAccount:[...optimized.byAccount],strategy:withdrawalStrategy(plan).mode,strategyLabel:withdrawalStrategy(plan).label};
      let need=Math.max(0,spending+contributions+finalTax.total-totalIncome-optimized.amount);
      if(need>0){
        let previous=-1,finalWorking=copyAccounts(accounts),ordinary={withdrawals:0,unfunded:0,byAccount:[]};
        for(let i=0;i<20;i++){
          const candidate=copyAccounts(accounts),result=withdraw(candidate,need,plan),taxable={...optimized.taxable};
          for(const x of result.byAccount.filter(x=>x.type==='RRSP/RRIF')){
            const key=taxable[x.owner]!==undefined?x.owner:(people[0]?.name||'Household member');
            taxable[key]=(taxable[key]||0)+x.amount;
          }
          const recalculated=global.HNTax.estimateHouseholdTax(taxable,row.year,inflationRate,province);
          const revisedNeed=Math.max(0,spending+contributions+recalculated.total-totalIncome-optimized.amount);
          finalWorking=candidate;ordinary=result;finalTax=recalculated;
          if(Math.abs(revisedNeed-need)<.01&&Math.abs(result.withdrawals-previous)<.01)break;
          need=revisedNeed;previous=result.withdrawals;
        }
        accounts=finalWorking;
        withdrawResult={withdrawals:optimized.amount+ordinary.withdrawals,unfunded:ordinary.unfunded,byAccount:[...optimized.byAccount,...ordinary.byAccount],strategy:withdrawalStrategy(plan).mode,strategyLabel:withdrawalStrategy(plan).label};
      }
      for(const w of withdrawResult.byAccount){const entry=ledger.find(x=>x.id===w.id);if(entry)entry.withdrawal+=w.amount}
      let surplusToCash=0;const netCash=totalIncome+withdrawResult.withdrawals-finalTax.total-spending-contributions;
      if(netCash>0){surplusToCash=netCash;const cash=accounts.find(a=>a.type==='Cash');cash.balance+=netCash;ledger.find(x=>x.id===cash.id).retainedCash+=netCash}
      for(const entry of ledger){const account=accounts.find(a=>a.id===entry.id);entry.closingBalance=account?.balance||0;entry.expectedClosing=entry.openingBalance+entry.growth+entry.contribution-entry.withdrawal+entry.retainedCash;entry.difference=entry.closingBalance-entry.expectedClosing}
      const startingInvestments=ledger.reduce((s,x)=>s+x.openingBalance,0),endingInvestments=ledger.reduce((s,x)=>s+x.closingBalance,0),expectedEndingInvestments=ledger.reduce((s,x)=>s+x.expectedClosing,0),reconciliationDifference=endingInvestments-expectedEndingInvestments;
      rows.push({...row,projection:{startingInvestments,growth,totalIncome,baseIncome:row.income.totalIncome,eventIncome:events.income,spending,eventExpense:events.expense,spendingDetails:spendingBreakdown.details,spendingCategories:spendingBreakdown.categories,tax:finalTax.total,federalTax:finalTax.federal,provincialTax:finalTax.provincial,taxByPerson:finalTax.byPerson,taxProvinceSupported:finalTax.provinceSupported,afterTaxIncome:totalIncome-finalTax.total,plannedContributions:planned,contributions,contributionsByAccount,withdrawals:withdrawResult.withdrawals,withdrawalsByAccount:withdrawResult.byAccount,withdrawalStrategy:withdrawResult.strategy||withdrawalStrategy(plan).mode,withdrawalStrategyLabel:withdrawResult.strategyLabel||withdrawalStrategy(plan).label,taxBracketTarget:optimized.target,plannedRegisteredDrawdown:optimized.amount,unfunded:withdrawResult.unfunded,surplusToCash,expectedEndingInvestments,reconciliationDifference,endingInvestments,netWorth:endingInvestments+nonInvestmentAssets-debt,accountLedger:ledger,accountBalances:ledger.map(x=>({id:x.id,name:x.name,type:x.type,balance:x.closingBalance}))}})
    }
    return rows;
  }
  function runSelfTests(){
    const failed=[];let total=0;const test=(name,fn)=>{total++;try{if(!fn())failed.push(name)}catch{failed.push(name)}};
    test('Monthly spending annualized',()=>annualSpending({expenses:[{amount:100,frequency:'Monthly'}]},2026,2026,2)===1200);
    test('Spending inflation',()=>Math.round(annualSpending({expenses:[{amount:1000,frequency:'Annual'}]},2027,2026,2))===1020);
    test('Income event classification',()=>eventCashFlow({events:[{year:2030,type:'Inheritance',amount:5000}]},2030).income===5000);
    test('Generic income event is taxable',()=>eventCashFlow({events:[{year:2030,type:'Income',amount:5000}]},2030).taxableIncome===5000);
    test('Spending category breakdown',()=>annualSpendingBreakdown({expenses:[{name:'Food',category:'Essential',amount:100,frequency:'Monthly'}]},2026,2026,2).categories.Essential===1200);
    test('Withdrawal priority recorded',()=>{const plan={hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:40}],household:{province:'British Columbia'},accounts:[{id:'n',name:'Taxable',type:'Non-registered',owner:'A',balance:100,returnRate:0,annualContribution:0},{id:'t',name:'TFSA',type:'TFSA',owner:'A',balance:100,returnRate:0,annualContribution:0}],debts:[],expenses:[{name:'Spend',category:'Essential',amount:150,frequency:'Annual'}],events:[]};const rows=buildProjection(plan,[{year:2040,people:[{name:'A',age:40,status:'Retired'}],income:{totalIncome:0,details:[]}}],{startYear:2040,indexRate:0});return rows[0].projection.withdrawalsByAccount.map(x=>x.type).join(',')==='Non-registered,TFSA'});
    test('Tax optimizer fills first bracket',()=>{const plan={hasPartner:false,people:[{name:'A',birthDate:'1970-01-01',retirementAge:55}],household:{province:'British Columbia'},planningModel:{withdrawalStrategy:{mode:'taxOptimized'}},accounts:[{id:'r',name:'RRSP',type:'RRSP/RRIF',owner:'A',balance:100000,returnRate:0,annualContribution:0}],debts:[],expenses:[],events:[]};const r=buildProjection(plan,[{year:2030,people:[{name:'A',age:60,status:'Retired'}],income:{totalIncome:20000,details:[{active:true,taxable:true,owner:'A',amount:20000}]}}],{startYear:2030,indexRate:0})[0].projection;return Math.round(r.plannedRegisteredDrawdown)===38523&&r.withdrawals===r.plannedRegisteredDrawdown});
    test('RRSP withdrawal increases tax',()=>{const plan={hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:40}],household:{province:'British Columbia'},accounts:[{id:'r',name:'RRSP',type:'RRSP/RRIF',owner:'A',balance:50000,returnRate:0,annualContribution:0}],debts:[],expenses:[{name:'Spend',category:'Essential',amount:30000,frequency:'Annual'}],events:[]};const r=buildProjection(plan,[{year:2040,people:[{name:'A',age:40,status:'Retired'}],income:{totalIncome:0,details:[]}}],{startYear:2040,indexRate:0})[0].projection;return r.tax>0&&r.withdrawals>30000});
    test('Portfolio roll-forward reconciles',()=>{const plan={hasPartner:false,people:[{name:'A',birthDate:'2000-01-01',retirementAge:65}],household:{province:'British Columbia'},accounts:[{id:'t',name:'TFSA',type:'TFSA',owner:'A',balance:100000,returnRate:5,annualContribution:7800}],debts:[],expenses:[{name:'Spend',category:'Essential',amount:20000,frequency:'Annual'}],events:[]};const r=buildProjection(plan,[{year:2026,people:[{name:'A',age:26,status:'Working'}],income:{totalIncome:80000,details:[{active:true,taxable:true,owner:'A',amount:80000}]}}],{startYear:2026,indexRate:0})[0].projection;return Math.abs(r.reconciliationDifference)<.01&&Math.abs(r.accountBalances.reduce((s,a)=>s+a.balance,0)-r.endingInvestments)<.01});
    return{ok:failed.length===0,total,failed};
  }
  global.HNProjection={annualSpending,annualSpendingBreakdown,eventCashFlow,taxableIncomeByPerson,buildProjection,runSelfTests};
})(typeof window!=='undefined'?window:globalThis);

