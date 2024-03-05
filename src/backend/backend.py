import requests
import json
from pathlib import Path
from collections import namedtuple
import time
import matplotlib.pyplot as plt
from datetime import datetime, timezone, timedelta
import random
import matplotlib.dates as mdates
from itertools import islice

# common

def get_data_directory():
    """    
    Get the path to the data directory.
    
    Parameters:
    None
    Returns:
    ./data
    """
    current_path = Path(__file__).resolve().parent
    return current_path.parent.parent / "data"

def get_accountID_path(filename="accountID.json"):
    """
    Get the path to the accountID JSON file in the data directory.
    
    Parameters:
    None
    Returns:
    ./data/accountID.json
    """
    return get_data_directory() / filename

def get_player_match_path(playername="maofeng"):
    """    
    Get the path to the playerMatch data file in the data directory.
    create the sub-directory if not exist.
    
    Parameters:
    playername -- str,player's name like maofeng
    Returns:
    ./data/maofeng/matchdata.json
    """ 
    # make sure sub dir exist.
    sub_dir=get_data_directory() / playername
    sub_dir.mkdir(parents=True, exist_ok=True)

    return get_data_directory() / playername/ "matchdata.json"

def write_to_player_json(player_name="maofeng",accout_ID="342958881"):
    
    # 读取既存的数据
    json_path=get_accountID_path()
    
    data = {}
    try:
        with open(json_path, 'r') as json_file:
            data = json.load(json_file)
    except (FileNotFoundError, json.JSONDecodeError):  # 文件不存在或JSON解码失败
        pass

    # 更新或添加键值对
    data[player_name] = accout_ID

    # 写入数据
    with open(json_path, 'w',encoding='utf-8') as file:
        json.dump(data, file, indent=4,ensure_ascii=False)

# plot mmr related
def generate_noise(num_points=100, noise_range=(-5, 5)):
    """generate a noise in range of -+5. since we are not accurate at the first place, no harm doing that.

    Args:
        num_points (int, optional): we get 100 matches, so it is 100. Defaults to 100.
        noise_range (tuple, optional): -+5range. Defaults to (-5, 5).

    Returns:
        noise: a -+5 list.
    """
    # Generate num_points-1 random numbers within the noise range
    noise = [random.randint(noise_range[0], noise_range[1]) for _ in range(num_points - 1)]
    
    # Ensure the sum of all noises is 0 by setting the last noise value
    noise.append(-sum(noise))
    
    return noise

def calculate_mmr_history_roughly(matches=None,current_mmr=4670):
    """    
    calculate win lose info from the raw matches json.
    It is a rough calculation, so win and lose is -+25.
    return the mmr.
    Parameters:
    matches100 -- dict,player's matches data request from OpendotaAPI
    Returns:
    mmrList -- list of last 100 mmr.
    """
    Coordinate = namedtuple("Coordinate", ["timestamp", "mmr"])
    current_timestamp_int = int(time.time())
    start_point = Coordinate(current_timestamp_int, current_mmr)  # 


    points = []
    points.append(start_point)
        
    # add some noise just for fun
    noise=generate_noise()
    for i in range(len(matches)):
        if  (matches[i]["player_slot"] <=127 and matches[i]["radiant_win"] == True) or (matches[i]["player_slot"] >=128 and matches[i]["radiant_win"] == False):
            current_mmr=current_mmr-25+noise[i]
        else:
            current_mmr=current_mmr+25+noise[i]
        points.append(Coordinate(matches[i]["start_time"],current_mmr))
    print("points")
    print(points)
    points.reverse()
    return points
    #
    
def plot_mmr_over_time_and_save(coordinates,player_name):
    # Extract timestamps and MMRs from the named tuples
    timestamps = [point.timestamp for point in coordinates]
    mmrs = [point.mmr for point in coordinates]

    # Convert timestamps to datetime objects
    dates = [datetime.utcfromtimestamp(ts) for ts in timestamps]

    # Plotting using matplotlib
    plt.figure(figsize=(12, 6))
    plt.plot(dates, mmrs, marker='o', linestyle='-')
    
    # Formatting the x-axis for dates
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y/%m/%d %H:%M:%S'))
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45)  # Rotate x-axis labels for better visibility

    plt.xlabel('Date (YYYY/MM/DD HH:MM:SS)')
    plt.ylabel('MMR')
    plt.title('MMR Over Time')
    plt.tight_layout()
    plt.grid(True)  # Add grid lines
   
    # save to player data
    current_time = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    sub_dir=get_data_directory() / player_name
    sub_dir.mkdir(parents=True, exist_ok=True)
    filename = get_data_directory() / player_name/ f"{current_time}.png"
    plt.savefig(filename,dpi=1080)
    plt.show()
        
# match data analysis related

def get_customized_match_data_and_save(playerName,condition={"limit":1000,"lobby_type":0}):
    """    
    get recent 100 ranked match data of the given accout ID,save the data and return it.
    lobby type 0 for normal, 7 for rank.
    lobby type -1 for all.
    
    Parameters:
    playername -- str,player's name like maofeng
    Returns:
    matches -- matches data in json
    """

    json_path=get_accountID_path()
    with open(json_path, "r") as json_file:
        data = json.load(json_file)        
        
    account_id = data[playerName]
    
    limit = condition["limit"]
    lobby_type = condition["lobby_type"]  # The lobby_type for "ranked" is 7 based on OpenDota's constants
    
    # translate the lobby_type
    if lobby_type == -1:
        url = f"https://api.opendota.com/api/players/{account_id}/matches?limit={limit}"
    else:
        url = f"https://api.opendota.com/api/players/{account_id}/matches?limit={limit}&lobby_type={lobby_type}"

    print(url)
    response = requests.get(url)
    
    # error handle
    if response.status_code != 200:
        print(f"Failed to fetch data. Status code: {response.status_code}")
        return None
    # happy path
    matches = response.json()
    matches.reverse()
    match_count=len(matches)
    player_match_path=get_player_match_path(playerName)
    with open(player_match_path, "w") as json_file:
        json.dump(matches, json_file, indent=4)
    print("matches")
    print(f"{match_count} matches are read")
    print(f"Data saved to {player_match_path} successfully!")
    return matches

def calculate_win_rate_and_others(playerName="test",matches=None):
    """calculate or collect some figure based on the match data
    for now I think the following should be noted.
    1 solo rank count
    2 party rank count
    3 solo rank win rate
    4 party rank win rate
    5 first match date
    
    the following should be interesting but not this time
    all unique heroes played
    most played hero and count
    top win rate hero
    
    

    Args:
        playerName: who we are investgating.
        matches (list, optional): recent 100 rank match data. Defaults to None.
    """
    win_rate=0
    solo_rank_win_rate=0
    party_rank_win_rate=0
    unknown_rank_win_rate=0
    first_match_timestamp=0
    last_match_timestamp=0
    solo_rank_count=0
    party_rank_count=0
    unknown_rank_count=0
    
    solo_win_count=0
    solo_lose_count=0
    party_win_count=0
    party_lose_count=0
    unknown_win_count=0
    unknown_lose_count=0
    
    #
    rank_match_count=0
    normal_match_count=0
    other_match_count=0
    match_count=len(matches)
    for i in range(len(matches)):
        
        # match type count
        if matches[i]["lobby_type"]==7:
            rank_match_count +=1
        elif matches[i]["lobby_type"]==0:
            normal_match_count +=1
        else:
            other_match_count +=1
            
        # win rate count
        if  (matches[i]["player_slot"] <=127 and matches[i]["radiant_win"] == True) or (matches[i]["player_slot"] >=128 and matches[i]["radiant_win"] == False):
            if matches[i]["party_size"] ==None:
                unknown_rank_count=unknown_rank_count+1
                unknown_win_count=unknown_win_count+1
            if matches[i]["party_size"] ==1:
                solo_rank_count=solo_rank_count+1
                solo_win_count=solo_win_count+1
            if matches[i]["party_size"]  in (2,3,4,5):
                party_rank_count=party_rank_count+1
                party_win_count=party_win_count+1
        else:
            if matches[i]["party_size"] ==None:
                unknown_rank_count=unknown_rank_count+1
                unknown_lose_count=unknown_lose_count+1
            if matches[i]["party_size"] ==1:
                solo_rank_count=solo_rank_count+1
                solo_lose_count=solo_lose_count+1
            if matches[i]["party_size"] in (2,3,4,5):
                party_rank_count=party_rank_count+1
                party_lose_count=party_lose_count+1
        if i == 1:
            first_match_timestamp=matches[i]["start_time"]
        if i == (len(matches)-1):
            last_match_timestamp=matches[i]["start_time"]
    
    if solo_rank_count!=0:
        solo_rank_win_rate=round((solo_win_count/solo_rank_count*100), 2)
    if party_rank_count!=0:
        party_rank_win_rate=round((party_win_count/party_rank_count*100), 2)
    if unknown_rank_count!=0:
        unknown_rank_win_rate=round((unknown_win_count/unknown_rank_count*100), 2)
    win_rate=round((solo_win_count+party_win_count+unknown_win_count)/(solo_rank_count+party_rank_count+unknown_rank_count)*100, 2)
    
    first_date_object = datetime.utcfromtimestamp(first_match_timestamp)
    last_date_object = datetime.utcfromtimestamp(last_match_timestamp)
    first_formatted_date = first_date_object.strftime('%Y/%m/%d %H:%M:%S') 
    last_formatted_date = last_date_object.strftime('%Y/%m/%d %H:%M:%S') 
    
    
    print(f"当前政审的是{playerName}")
    print(f"本次读取了{match_count}条比赛数据,其中")
    if rank_match_count !=0:
        print(f"天梯{rank_match_count}把")
    if normal_match_count !=0:
        print(f"普通{normal_match_count}把")
    if other_match_count !=0:
        print(f"其他{other_match_count}把")
    print(f"最早的一把是{first_formatted_date}打的")
    print(f"而最近的一把则是{last_formatted_date}打的")
    
        
        
        
    print(f"{playerName}的总体胜率是 {win_rate}%")
    if win_rate < 46:
        print("哥们，你可能是个赠品马。")
    elif 46 <= win_rate < 48:
        print("从这一百把平均来看，你的整体表现更像一个下等马，兄弟。")
    elif 48 <= win_rate < 52:
        print("有时带领大家冲向胜利，有时躺，有时被坑得睡不着，你就像大多数人一样是个中等马。")
    elif 52 <= win_rate < 54:
        print("我命由我不由天，你一定下了功夫，试图把胜利掌握在自己手中。你做到了，我的上等马兄弟。")
    else:
        print("我愿化作你怀中的阿斗，特等马赵桑！")
    print("")
    
    print("由于API和其他诸多原因，并不能够完全把握组队状态。从本次抽出来看，")
    print(f"{playerName}的单排把数是 {solo_rank_count}把")
    if solo_rank_count!=0:
        print(f"{playerName}的单排胜率是 {solo_rank_win_rate}%")
    print(f"{playerName}的组排把数是 {party_rank_count}把")
    if party_rank_count!=0:
        print(f"{playerName}的组排胜率是 {party_rank_win_rate}%")
    print(f"{playerName}的组队状态不明比赛把数是 {unknown_rank_count}把")
    if unknown_rank_count!=0:
        print(f"{playerName}的组队状态不明比赛胜率是 {unknown_rank_win_rate}%")

def calculate_hero_related_and_others(playerName,matches=None):
    """get the dota2 hero info from dotaconstants
    calculate the 
    top 5 most played hero and their win rate.
    
    top 5 highest win rate hero (at least 10 matches.)

    Args:
        playerName: who we are investgating.
        matches (list, optional): recent 100 rank match data. Defaults to None.
    """

    with open(f'{get_data_directory()/"dotaconstants/build/heroes.json"}', 'r') as file:
        hero_data = json.load(file)

    # Step 2: iterate the dict
    for key in hero_data:
        hero_data[key]['count'] = 0  # 0
        hero_data[key]['win_count'] = 0  # 0
        hero_data[key]['win_rate'] = 0  # 0
        
    for i in range(len(matches)):
        # every game count hero
        # fix bug hero id = 0
        if str(matches[i]["hero_id"]) == "0":
            continue

        hero_data[str(matches[i]["hero_id"])]['count'] +=1  # 0
        if  (matches[i]["player_slot"] <=127 and matches[i]["radiant_win"] == True) or (matches[i]["player_slot"] >=128 and matches[i]["radiant_win"] == False):
            # win game
            # count hero win
            hero_data[str(matches[i]["hero_id"])]['win_count'] +=1  # 0
    
    # calculate the win rate for all none zero hero.
    for key in hero_data:
        if hero_data[key]['count'] == 0:
            continue
        hero_data[key]['win_rate'] = round(hero_data[key]['win_count']/hero_data[key]['count']*100,2)
        
        
    # sort the dict by play
    most_played_sort_hero_data = dict(sorted(hero_data.items(), key=lambda item: item[1]['count'], reverse=True))
    
    # get rid of the hero less than 10
    filtered_hero_data = {k: v for k, v in hero_data.items() if v['count'] >= 10}    
    
    
    most_winning_sort_hero_data = dict(sorted(filtered_hero_data.items(), key=lambda item: item[1]['win_rate'], reverse=True))
    
    # output
    print(f"接下来是英雄部分的些许数据分析。")
    print(f"使用次数top5的5个英雄和他们的胜率是：")
    print("")

    for key, value in islice(most_played_sort_hero_data.items(), 5):
        print(f"{value['localized_name']} 场数{value['count']} 胜率{value['win_rate']}%")
        print("")
    print(f"胜率top5的5个英雄(场数大于等于10)和他们的场数是：")
    print(f"注：可能结果不足5个")
    print("")
    more_than_10_game_hero = 5 if len(filtered_hero_data) >= 5 else len(filtered_hero_data)    
    for key, value in islice(most_winning_sort_hero_data.items(), more_than_10_game_hero):
        print(f"{value['localized_name']} 胜率{value['win_rate']}% 场数{value['count']} ")
        print("")
    print(f"怎么样，这样的结果是否符合你的预期呢？")
 
def analyze_custom_input(player_name,account_ID,limit,match_type):
    """get 4 input, update the json file, get the match data, calculate the relative info.

    Args:
        player_name (str): player name, do not need to be steam nick name, just for print.
        account_ID (num): steam accout ID, AKA dota2 friend ID
        limit (num): how many matches to get.
        match_type (num): lobby type. 7 for rank, 0 for normal, -1 for all.
    """
    write_to_player_json(player_name,account_ID)
    condition={"limit":limit,"lobby_type":match_type}
    match_data=get_customized_match_data_and_save(player_name,condition)
    if not match_data:
        print("no match data found. please check your account ID.")
    else:
        calculate_win_rate_and_others(player_name,match_data)
        calculate_hero_related_and_others(player_name,match_data)






# whole new API started here. maybe I have to rewrite everything.

def get_customized_match_data_and_save_stratz_API(playerName,lobbytype,isParty,limit):
    # 定义变量
    json_path=get_accountID_path()
    with open(json_path, "r") as json_file:
        data = json.load(json_file)        
        
    steam_account_id = data[playerName]  # 玩家 Steam 账户 ID
    num_matches = limit            # 请求的比赛总数
    
    
    api_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiJodHRwczovL3N0ZWFtY29tbXVuaXR5LmNvbS9vcGVuaWQvaWQvNzY1NjExOTgwOTY4ODUwNDEiLCJ1bmlxdWVfbmFtZSI6IldDLkJDU1pTWiIsIlN1YmplY3QiOiI2NWI0MGUzYi1iZDk4LTRmZWItODIxMy03ZjMwODZhMTY0MmIiLCJTdGVhbUlkIjoiMTM2NjE5MzEzIiwibmJmIjoxNjgzMjYwNzk2LCJleHAiOjE3MTQ3OTY3OTYsImlhdCI6MTY4MzI2MDc5NiwiaXNzIjoiaHR0cHM6Ly9hcGkuc3RyYXR6LmNvbSJ9.M5684-du3yGlAuyMJzr9nMQD_1bVbvJZijr5Cky4zNA'         # API 认证令牌
    # GraphQL 查询和端点
    url = 'https://api.stratz.com/graphql'
    query = '''
    {
    player(steamAccountId: ''' + str(steam_account_id) + ''') {
        matches(request: {
        take: ''' + str(num_matches) + ''',
        lobbyTypeIds:''' + str(lobbytype) + '''
        isParty:''' + str(isParty) + '''         
        }) {
        id
        startDateTime
        didRadiantWin
        durationSeconds
        lobbyType
        gameMode
        actualRank
        averageImp
        averageRank      
        players {
            playerSlot
            kills
            deaths
            assists        
            steamAccountId
            isRadiant
            isVictory
            heroId
        }
        }
    }
    }
    '''

    # 请求头
    headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api_token
    }

    # 发送请求
    response = requests.post(url, json={'query': query}, headers=headers)

    # error handle
    if response.status_code != 200:
        print("Query failed to run by returning code of {}. {}".format(response.status_code, query))
        return None
    # happy path
    data = response.json()
    return data
    # ## temp code to find my win rate with dashen
    # count_win=0
    # count_match=0
    # count_win_with_SCH=0
    # count_match_with_SCH=0
    # count_win_with_SCH_and_without_XMF=0
    # count_match_with_SCH_and_without_XMF=0
    # for match in data["data"]["player"]["matches"]:
    #     player_ids = {player["steamAccountId"]: player for player in match["players"]}
    #     print(player_ids)

    #     if 136619313 in player_ids:
    #         count_match += 1
    #         playerA=player_ids[136619313]

    #         if player_ids[136619313]["isVictory"]:
    #             count_win += 1

    #         if 243513067 in player_ids:
    #             playerB = player_ids[243513067]
    #             if playerA["isRadiant"] == playerB["isRadiant"]:
    #                 count_match_with_SCH += 1
                
    #             if playerB["isVictory"]:
    #                 count_win_with_SCH += 1
                    
    #             if 342958881 not in player_ids:
    #                 count_match_with_SCH_and_without_XMF += 1

    #                 if playerA["isVictory"]:
    #                     count_win_with_SCH_and_without_XMF += 1                    

    # # 计算胜率
    # victory_rate = count_win / count_match if count_match > 0 else 0
    # cooperation_victory_rate = count_win_with_SCH / count_match_with_SCH if count_match_with_SCH > 0 else 0
    # cooperation_exclusive_victory_rate = count_win_with_SCH_and_without_XMF / count_match_with_SCH_and_without_XMF if count_match_with_SCH_and_without_XMF > 0 else 0






    # print("胜利场数:", count_win)
    # print("与A合作胜利场数:", count_win_with_SCH)
    # print("与A且B不在胜利场数:", count_win_with_SCH_and_without_XMF)
    # print("胜率:", victory_rate)
    # print("与A合作胜率:", cooperation_victory_rate)
    # print("与A且B不在胜率:", cooperation_exclusive_victory_rate)
            

def calculate_solo_rank_winrate_by_stratz_API(playerName,lobbytype,isParty,limit):
    solo_data=get_customized_match_data_and_save_stratz_API(playerName,lobbytype,isParty,limit)
    count_win=0
    count_match=100
    json_path=get_accountID_path()
    with open(json_path, "r") as json_file:
        data = json.load(json_file)        
        
    steam_account_id = data[playerName]  # 玩家 Steam 账户 ID
    
    
    # count win rate
    count=0
    first_match_timestamp=0
    last_match_timestamp=0
    for match in solo_data["data"]["player"]["matches"]:
        # player_ids = {player["steamAccountId"]: player for player in match["players"]}
        # print(player_ids)
        count=count+1

        if count==1:
            # 执行第一个循环的额外操作
            first_match_timestamp=match["startDateTime"]

        if count==100:
            last_match_timestamp=match["startDateTime"]
            
        for player in match["players"]:
            if player["steamAccountId"] == int(steam_account_id):
                if player["isVictory"]:
                    count_win += 1 
                break  

    # 计算胜率
    victory_rate = round(count_win / count_match,4)*100 if count_match > 0 else 0
    eastern_eight_zone = timezone(timedelta(hours=8))
    first_date_object = datetime.fromtimestamp(first_match_timestamp,eastern_eight_zone)
    last_date_object = datetime.fromtimestamp(last_match_timestamp,eastern_eight_zone)
    first_formatted_date = first_date_object.strftime('%Y/%m/%d %H:%M:%S') 
    last_formatted_date = last_date_object.strftime('%Y/%m/%d %H:%M:%S') 


    lobbytype_word=""
    if lobbytype==7:
        lobbytype_word="天梯"
    else:
        lobbytype_word="普通"
    
    print(f"当前政审的是{playerName}")    
    print(f"本次读取了{limit}条{lobbytype_word}比赛数据,其中")
    print(f"最早的一把是{first_formatted_date}打的")
    print(f"而最近的一把则是{last_formatted_date}打的")    
    print(f"{playerName}的总体胜率是 {victory_rate}%")
    if victory_rate < 46:
        print("哥们，你可能是个赠品马。")
    elif 46 <= victory_rate < 48:
        print("从这一百把平均来看，你的整体表现更像一个下等马，兄弟。")
    elif 48 <= victory_rate < 52:
        print("有时带领大家冲向胜利，有时躺，有时被坑得睡不着，你就像大多数人一样是个中等马。")
    elif 52 <= victory_rate < 54:
        print("我命由我不由天，你一定下了功夫，试图把胜利掌握在自己手中。你做到了，我的上等马兄弟。")
    else:
        print("我愿化作你怀中的阿斗，特等马！让我猜猜，你其实就是大神对吧")
    
    
    
    
    
    
    return victory_rate



def main():
    # returned_data=get_customized_match_data_and_save_stratz_API("liaoweiran",7,"false",100)
    winrate=calculate_solo_rank_winrate_by_stratz_API("大神",7,"false",100)
    

if __name__ == "__main__":
    main()
