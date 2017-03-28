const http = require('http');
const PATH = require("path");
const FS = require("fs");
const PG = require('pg');

class PGClass {
    
    constructor(){
	this.queue= new Map();
    }

    execSql(conf,scrpt,vars){
	let qid=this.randomString(6);
	this.queue.set(qid,{
	    status:"connecting",
	    result:{},
	    err:{},
	    pool:new PG.Pool(conf)
	});

	let obj=this.queue.get(qid);
	
	obj.pool.connect((err, client, done)=>{
	    if(err) {
		return console.error('error fetching client from pool', err);
	    }

	    obj.status="in-progress";
	    
	    client.query(scrpt, vars,(err, result)=>{

		done(err);

		if(err) {
		    obj.err=err;
		    return console.error('error running query', err);
		}
		obj.status="done";
		obj.result=result;
		//console.log(result.rows[0].number);
	    });
	});

	return obj;
    }

    map2Obj(map){
	let _po={};
	map.forEach((value, key) => {
	    _po[key]=value;
	});

	return _po;
    }

    randomString(size, chars){
	size = size || 6;
	chars = chars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let max = chars.length;
	let ret = '';
	for (let i = 0; i < size; i++) {
	    ret += chars.charAt(Math.floor(Math.random() * max));
	}
	return ret;
    }
    
    status(){
	return this.map2Obj(this.queue);
    }
}

const _pg=new PGClass();

http.createServer((req, res)=>{
    
    //static ui
    if (req.url.indexOf("/main/")===0&&
	req.method.toLowerCase()==="get"){

	let _p = PATH.normalize(req.url).replace(/^(\.\.[\/\\])+/, '').replace("/main","");

	if (_p.trim()==="/")
	    _p="/index.html";
	
	return FS.readFile("./html5"+_p,(err,data)=>{
	    if (err){
		console.log(`${new Date()} invalid file request for ${req.url} (EC API)`);
		res.writeHead(501);
		return res.end();
	    }

	    console.log(`${new Date()} file request for ${req.url} (EC API)`);
	    res.writeHead(200);
	    return res.end(data);
	});
    }

    
    if (req.url==="/sql"){

	switch (req.method.toLowerCase()){

	/* sql body. Perrin: need to ingest json in the following format
        {
           "script":"select $1,$2 from abc",
	   "vars":["column1","column2"],
           "conn":{
	      "user": "foo", //env var: PGUSER
	      "database": "my_db", //env var: PGDATABASE
	      "password": "secret", //env var: PGPASSWORD
	      "host": "localhost", // Server hosting the postgres database
	      "port": 5432, //env var: PGPORT
	      "max": 10, // max number of clients in the pool
	      "idleTimeoutMillis": 30000, // how long a client is allowed to remain idle before being closed
	   }
        }    
        */
	case "post":

	    let _chunk='',_body;

	    req.on('data',(chunk)=>{
		_chunk+=chunk;
	    });

	    req.on('end', ()=>{
		
		debugger;
		try {
		    _body=JSON.parse(_chunk);
		    let _sts=_pg.execSql(_body.conn,_body.script,_body.vars);
		    res.writeHead(201,{"Content-Type": "application/json"});
		    return res.end(_sts);
		}
		catch(e){
		    res.writeHead(501);
		    return res.end();
		}
	    });
	    break;

	//to get the overall status
	case "get":
	    res.writeHead(201,{"Content-Type": "application/json"});
	    return res.end(_pg.status())
	default:
	    res.writeHead(501);
	    return res.end();
	}

	return;
    }

    res.writeHead(404);
    return res.end();
    
}).listen(process.env.PORT||8989, _=> {
    console.log(`${new Date()} CF healthcheck mockup call.`);
});
