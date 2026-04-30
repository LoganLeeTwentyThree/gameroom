import { DurableObjectStub } from "@cloudflare/workers-types";
import { DurableObject } from "cloudflare:workers";

export class RateLimiter<Env = unknown> extends DurableObject<Env>
{
    //in-memory state doesn't need to be saved between hibernations
    //if a rate-limiter hibernates, its not receiving any requests!
    bucket : number = 250
    lastRequest : number = Date.now()
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    private refill()
    {
        const now = Date.now();
        const deltaSeconds = (now - this.lastRequest) / 1000;
        const tokensToAdd = deltaSeconds * 250;

        this.bucket = Math.min(250, this.bucket + tokensToAdd);
        this.lastRequest = now;
    }

    countRequest() 
    {
        this.refill()
        this.bucket -= 1
    }

    getRemaining() : number
    {
        this.refill()
        return this.bucket
    }
}

// RateLimiterClient implements rate limiting logic on the caller's side.
export class RateLimiterClient {
    inCooldown : boolean = false
    limiter: DurableObjectStub<RateLimiter>
    getLimiterStub: () => DurableObjectStub<RateLimiter>
    constructor(getLimiterStub : () => DurableObjectStub<RateLimiter>) {
        this.getLimiterStub = getLimiterStub;

        // Call the callback to get the initial stub.
        this.limiter = getLimiterStub();
    }

    // Call checkLimit() when a message is received to decide if it should be blocked due to the
    // rate limit. Returns `true` if the message should be accepted, `false` to reject.
    checkLimit() {
        this.callLimiter();
        if (this.inCooldown) {
            return false;
        }
        return true;
    }

    deduct()
    {
        this.limiter.countRequest()
    }

    // callLimiter() is an internal method which talks to the rate limiter.
    private async callLimiter() {
        const remaining = await this.limiter.getRemaining();

        //if you run out of tokens, wait until the bucket is full again
        if(remaining <= 0)
        {
            this.inCooldown = true
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.inCooldown = false
        }
    }
}