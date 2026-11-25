import { loadNetwork, routeOnGraph } from './road-network.js';
self.addEventListener('message',async event=>{
  const {id,origin,destination}=event.data;
  try {self.postMessage({id,result:routeOnGraph(await loadNetwork(),origin,destination)});}
  catch(error){self.postMessage({id,error:error.message||'Driving route unavailable.'});}
});
