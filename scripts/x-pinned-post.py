# Prints the shop's pinned X post as twitter-cli JSON ({"ok":true,"data":[tweet]}).
# twitter-cli 0.8.5 skips the pinned entry of UserTweets, and the shop pins its Sunday week
# schedule picture there. Uses twitter-cli's own client, so it needs the same pinned version.
import json
import sys

from twitter_cli.cli import _get_client
from twitter_cli.graphql import FEATURES
from twitter_cli.parser import parse_tweet_result
from twitter_cli.serialization import tweets_to_data

client = _get_client(quiet=True)
user = client.fetch_user(sys.argv[1])
data = client._graphql_get("UserTweets", {
    "userId": user.id, "count": 5, "includePromotedContent": False, "latestControlAvailable": True,
    "requestContext": "launch", "withQuickPromoteEligibilityTweetFields": True, "withVoice": True, "withV2Timeline": True,
}, FEATURES)
instructions = (((data.get("data") or {}).get("user") or {}).get("result") or {}).get("timeline_v2", {}).get("timeline", {}).get("instructions") or []
tweets = []
for instruction in instructions:
    entry = instruction.get("entry") if instruction.get("type") == "TimelinePinEntry" else None
    result = (((entry or {}).get("content") or {}).get("itemContent") or {}).get("tweet_results", {}).get("result")
    tweet = parse_tweet_result(result) if result else None
    if tweet:
        tweets.append(tweet)
print(json.dumps({"ok": True, "data": tweets_to_data(tweets)}, ensure_ascii=False))
