import express from 'express'
import cors from 'cors'
import {createClient} from '@supabase/supabase-js'
import dotenv from 'dotenv';
import js2xmlparser from "js2xmlparser"; // Convert JSON to XML
import yaml from 'js-yaml';
dotenv.config({ path: '.env'});

const app=express()
const port=3000
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

const supabase = createClient(`${process.env.VITE_PROJECT_URL}`, `${process.env.VITE_SUPABASE_ANON_PUBLIC}`);


function calculateExpiration(createdAt, expireAfter) {
    const createdDate = new Date(createdAt);
    return new Date(createdDate.getTime() + expireAfter * 60000).toISOString();
}
function formatResponse(req, res, data) {
    const acceptHeader = req.headers.accept || 'application/json'

    if (acceptHeader.includes('application/xml')) {
        res.setHeader('Content-Type', 'application/xml')
        res.send(js2xmlparser.parse("response", data)) // Convert to XML
    } else if (acceptHeader.includes('application/yaml') || acceptHeader.includes('text/yaml')) {
        res.setHeader('Content-Type', 'application/yaml')
        res.send(yaml.dump(data)) // Convert to YAML
    } else {
        res.setHeader('Content-Type', 'application/json');
        res.json(data) // Default to JSON
    }
}

app.get("/",(req,res)=>{
    res.send("Hello")
})


app.post("/secret",async(req,res)=>{
    //Params
    const{secret,expire_after,expire_after_views}=req.body
    const createdAt = new Date().toISOString();
    const expiresAt = calculateExpiration(createdAt, expire_after);
    //insert
    const { data, error } = await supabase.from('secrets')
        .insert({ secret, expire_after, expire_after_views, created_at: createdAt, expires_at: expiresAt })
        .select();

    if (error) {
        console.error(error);
        return res.status(500).send("Failed to create secret.")
    }
    const response={
        hash: data[0].id,
        secretText: data[0].secret,
        createdAt: data[0].created_at,
        expiresAt: data[0].expires_at,
        remainingViews: data[0].expire_after_views
    }
    formatResponse(req, res, response);
})




app.get(`/secret/:hash`,async(req,res)=>{
    const {hash}=req.params

    const {data,error}=await supabase.from('secrets')
        .select()
        .eq("id",hash)

    if (error || !data?.length) {
        console.error(error);
        return res.status(404).send("Secret not found.");
    }


    const secret = data[0]
    const now = new Date()

    if (now > secret.expires_at) {
        await supabase.from('secrets').delete().eq('id', hash);
        throw new Error("Sorry, it has expired.");
    }
    if (secret.expire_after_views <= 0) {
        await supabase.from('secrets').delete().eq('id', hash);
        throw new Error("Sorry, it has expired due to exceeding the view limit.");
    }

    else {
        const updatedExpireAfterViews=data[0].expire_after_views-1
        const { error:updateError } = await supabase
            .from('secrets')
            .update({ expire_after_views :updatedExpireAfterViews })
            .eq('id', hash)

        if(updateError){
            return res.status(500).send("Failed to update the views.")
        }
        const response = {
            hash: secret.id,
            secretText: secret.secret,
            createdAt:secret.created_at,
            expiresAt:secret.expires_at,
            remainingViews: updatedExpireAfterViews,
        };
        formatResponse(req, res, response)
    }
    if(error){
        console.error(error)
    }


})

app.listen(port,()=>{
    console.log(`App is listening on port${port}`)
})