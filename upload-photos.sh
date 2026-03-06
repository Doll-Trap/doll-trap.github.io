#!/bin/bash

API_BASE="http://localhost:8000"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3Mjc1NTQyMywiZXhwIjoxNzczMzYwMjIzfQ.2YEko-nSAJ2esoXQMI7FlWKH5IPvUJlDu2J8tbk5skg"

echo "Starting photo upload..."
echo ""

# Get all events and extract IDs  
echo "Fetching events..."
EVENTS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/api/events")

# Extract using Python for better JSON parsing
XAMA_EVENT_ID=$(echo "$EVENTS_JSON" | python3 -c "import sys, json; events = json.load(sys.stdin); event = next((e for e in events if e.get('title') == 'XAMA Live House'), None); print(event['id'] if event else '')")
SPFES_EVENT_ID=$(echo "$EVENTS_JSON" | python3 -c "import sys, json; events = json.load(sys.stdin); event = next((e for e in events if e.get('title') == 'SKBY × HCCA Spring Festival'), None); print(event['id'] if event else '')")

echo "XAMA Event ID: $XAMA_EVENT_ID"
echo "Spring Festival Event ID: $SPFES_EVENT_ID"
echo ""

if [ -z "$XAMA_EVENT_ID" ] || [ -z "$SPFES_EVENT_ID" ]; then
  echo "Error: Could not find event IDs"
  echo "Events JSON: $EVENTS_JSON"
  exit 1
fi

success_count=0
fail_count=0

# Upload XAMA photos
echo "Uploading XAMA photos..."
for file in images/xama/*.jpg; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    echo "  Uploading $filename..."
    
    response=$(curl -s -X POST "$API_BASE/api/photos" \
      -H "Authorization: Bearer $TOKEN" \
      -F "photo=@$file" \
      -F "event_id=$XAMA_EVENT_ID" \
      -F "member_tag=Group" \
      -F "caption=${filename%.*}" \
      -w "\n%{http_code}")
    
    http_code=$(echo "$response" | tail -n1)
    if [[ "$http_code" == "201" ]] || [[ "$http_code" == "200" ]]; then
      echo "    ✓ Success"
      ((success_count++))
    else
      echo "    ✗ Failed (HTTP $http_code)"
      ((fail_count++))
    fi
  fi
done

echo ""

# Upload Spring Festival photos
echo "Uploading Spring Festival photos..."
for file in images/SpFes/*.jpg; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    echo "  Uploading $filename..."
    
    response=$(curl -s -X POST "$API_BASE/api/photos" \
      -H "Authorization: Bearer $TOKEN" \
      -F "photo=@$file" \
      -F "event_id=$SPFES_EVENT_ID" \
      -F "member_tag=Group" \
      -F "caption=${filename%.*}" \
      -w "\n%{http_code}")
    
    http_code=$(echo "$response" | tail -n1)
    if [[ "$http_code" == "201" ]] || [[ "$http_code" == "200" ]]; then
      echo "    ✓ Success"
      ((success_count++))
    else
      echo "    ✗ Failed (HTTP $http_code)"
      ((fail_count++))
    fi
  fi
done

echo ""
echo "✓ Complete: $success_count uploaded, $fail_count failed"
