# Go Wild Feature Test Plan

## Prerequisites
1. MaiFarm server running on port 4567
2. Frontend running on port 3000
3. WebSocket connection established

## Test Cases

### 1. UI Component Tests

#### 1.1 Quick Action Button
- [ ] Go Wild button appears in Quick Actions
- [ ] Button has proper styling (green color, Sparkles icon)
- [ ] Button is clickable and responsive

#### 1.2 Go Wild Modal
- [ ] Clicking Go Wild button opens modal
- [ ] Modal displays configuration options:
  - [ ] Creativity level slider (0-100)
  - [ ] Exploration depth control
  - [ ] Max duration input
  - [ ] Safety boundaries checkboxes
  - [ ] Focus areas textarea
- [ ] Cancel button closes modal
- [ ] Start Exploration button is disabled without farm ID

#### 1.3 Go Wild Mode Component
- [ ] Displays when exploration starts
- [ ] Shows connection status indicator
- [ ] Control buttons (Start/Pause/Resume/Stop) work
- [ ] Statistics update in real-time
- [ ] Exploration graph visualization renders
- [ ] Discoveries list populates

### 2. Backend API Tests

#### 2.1 Start Exploration
```bash
curl -X POST http://localhost:4567/api/go-wild/start \
  -H "Content-Type: application/json" \
  -d '{
    "farmId": "test-farm-1",
    "config": {
      "creativityLevel": 70,
      "explorationDepth": 5,
      "maxDuration": 30,
      "boundaries": {
        "allowExternalAPIs": true,
        "allowFileSystem": true,
        "allowNetworkRequests": true,
        "restrictedDomains": []
      },
      "focusAreas": ["optimization", "security"]
    }
  }'
```
Expected: 200 OK with session data

#### 2.2 Get Session
```bash
curl http://localhost:4567/api/go-wild/session/test-farm-1
```
Expected: Session data or 404 if no active session

#### 2.3 Pause Exploration
```bash
curl -X PUT http://localhost:4567/api/go-wild/{sessionId}/pause
```
Expected: 200 OK

#### 2.4 Resume Exploration
```bash
curl -X PUT http://localhost:4567/api/go-wild/{sessionId}/resume
```
Expected: 200 OK

#### 2.5 Stop Exploration
```bash
curl -X PUT http://localhost:4567/api/go-wild/{sessionId}/stop
```
Expected: 200 OK with summary

### 3. WebSocket Tests

#### 3.1 Real-time Updates
- [ ] Connect to WebSocket at ws://localhost:4567
- [ ] Subscribe to farm updates
- [ ] Receive goWild:started event
- [ ] Receive goWild:node-added events
- [ ] Receive goWild:discovery-made events
- [ ] Receive goWild:status-changed events

### 4. Integration Tests

#### 4.1 End-to-End Flow
1. [ ] Create or select a farm
2. [ ] Click Go Wild button
3. [ ] Configure exploration settings
4. [ ] Start exploration
5. [ ] Verify real-time updates appear
6. [ ] Pause exploration
7. [ ] Resume exploration
8. [ ] Save a discovery
9. [ ] Stop exploration
10. [ ] Verify summary is displayed

#### 4.2 Safety Boundaries
- [ ] Verify restricted domains are enforced
- [ ] Verify file system boundaries work
- [ ] Test resource limits (memory, CPU)
- [ ] Test emergency stop functionality

### 5. Error Cases

#### 5.1 Invalid Configuration
- [ ] Submit with invalid boundaries
- [ ] Submit without farm ID
- [ ] Submit with negative duration
- [ ] Submit with creativity > 100

#### 5.2 Connection Issues
- [ ] Handle WebSocket disconnection
- [ ] Handle API errors gracefully
- [ ] Show appropriate error messages

### 6. Performance Tests

#### 6.1 Resource Usage
- [ ] Monitor memory usage during exploration
- [ ] Check CPU usage stays within limits
- [ ] Verify cleanup after session ends

#### 6.2 Scalability
- [ ] Test with multiple concurrent sessions
- [ ] Test with large exploration graphs
- [ ] Test with many discoveries

## Issues Found

### Critical
- [ ] 

### High Priority
- [ ] 

### Medium Priority
- [ ] 

### Low Priority
- [ ] 

## Recommendations
1. 
2. 
3. 

## Sign-off
- [ ] All tests passed
- [ ] No critical issues remaining
- [ ] Feature ready for production