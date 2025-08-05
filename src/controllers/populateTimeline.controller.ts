import { Request, Response } from 'express';
import driver from '../neo4j';
import zod from 'zod';

export const populateTimeline = async (req: Request, res: Response): Promise<any> => {
    const session = driver.session({ database: "blog-app" });

    try {

        const userId = req.user && req.user.userId

        try {
            // retrieve all the latest posts by the user you follow or you have liked/bookmarked/commented upon their posts in the last one month,

            const retrievePostsQuery =
                `
                    //=== PHASE 1 ====
                    MATCH (u:User)
                    WHERE elementId(u) = $userId

                    //Posts by followed users
                    OPTIONAL MATCH (u)-[:FOLLOWING]->(followed:User)-[:posted]->(fp:Blog)   
                    
                    // Posts the user interacted with 
                    OPTIONAL MATCH (u)-[:Liked|WROTE|bookmarked]->(ip:Blog)

                    WITH COLLECT(DISTINCT fp) + COLLECT(DISTINCT ip) AS recentPostsUnsorted
                    UNWIND recentPostsUnsorted AS post
                    WITH DISTINCT post 
                    RETURN post
                    ORDER BY post.createdAt DESC 
                    LIMIT 20

                    UNION 

                    // === PHASE 2 ===
                    MATCH (u:User)
                    WHERE elementId(u) = $userId

                    // posts by followed users
                    OPTIONAL MATCH (u)-[:FOLLOWING]->(f:user)-[:posted]->(p1:Blog)
                    WITH u , f, p1 , 5 as followScore

                    // Likes 
                    OPTIONAL MATCH (u)-[:Liked]->(p2:Blog)
                    WITH u , f, p1, followScore , p2, 2 as likeScore

                    //Comments
                    OPTIONAL MATCH (u)-[:WROTE]->(p3:Blog)
                    WITH u , f, p1, followScore, p2, likeScore,p3 , 3 AS commentScore

                    // bookmarks 
                    OPTIONAL MATCH (u)-[:bookmarked]->(p4:Blog)
                    WITH u , f , p1 , followScore , p2 , likeScore , p3 , commentScore , p4 , 2 AS bookmarkScore
                    
                    WITH 
                        COLLECT (DISTINCT {post:p1, score:followScore}) + 
                        COLLECT (DISTINCT {post:p2, score:likeScore}) + 
                        COLLECT (DISTINCT {post:p3, score:commentScore}) + 
                        COLLECT (DISTINCT {post:p4,score:bookmarkScore}) AS scoredPosts

                    UNWIND scoredPosts AS entry
                    WITH entry.post AS post , entry.score AS score
                    WHERE post IS NOT NULL

                    WITH post , SUM(score) AS totalScore
                    RETURN post 
                    ORDER BY totalScore DESC , post.createdAt DESC
                    LIMIT 20 
                `

            //  this gives you all the users who you follow , 
            const result = await session.run(retrievePostsQuery,{userId});

            console.log(result);

            const posts = result.records.map((post) => {
                post.get('post').properties.createdAt = post.get('post').properties.createdAt.toStandardDate().toISOString()
                return post.get('post').properties;
            })

            return res.status(200).json({ msg: "posts", posts});

        } catch (err) {
            console.error(err);
            return { success: false, error: err };
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error.." })
    }finally{
        session.close();
    }
}