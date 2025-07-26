import neo4j, { error } from 'neo4j-driver';
import dotenv from 'dotenv';

// configure environment variables
dotenv.config();

if(!process.env.neo4j_pass){
    throw new Error("neo4j_pass is not available..")  
}

const driver = neo4j.driver(
    'neo4j://127.0.0.1:7687',
    neo4j.auth.basic('neo4j', process.env.neo4j_pass)
)

export default driver;