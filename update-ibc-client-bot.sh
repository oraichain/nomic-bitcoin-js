#!/bin/bash

# Define your Discord webhook URL
WEBHOOK_URL=${WEBHOOK_URL:-""}

# Function to send message to Discord webhook
update_client() {
    host_chain=$1
    client_id=$2
    bash ./discord.sh --webhook-url="$WEBHOOK_URL" --text "updating client for host chain $host_chain with client id $client_id ..."
    result=$(hermes update client --host-chain $host_chain --client $client_id)
    parsed_result=$(echo -n "$result" | jq -Rs . | cut -c 2- | rev | cut -c 2- | rev)
    bash ./discord.sh --webhook-url="$WEBHOOK_URL" --text "$parsed_result"
}

# Main loop. Update every day
while true; do
    # Get current hour
    current_hour=$(date +%H)

    # Check if it's the desired time (for example, 9 AM)
    if [ $current_hour -eq 9 ]; then
        # Send message
        update_client "oraibtc-mainnet-1" "07-tendermint-3"
        update_client "Oraichain" "07-tendermint-194"
        
        # Sleep for 24 hours (86400 seconds)
        sleep 86400
    else
        # Sleep for 1 hour (3600 seconds)
        sleep 3600
    fi
done